"""
Admin API endpoints.
All routes require admin role.
"""
import uuid
from datetime import datetime, timezone, date, timedelta
from typing import Optional, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, desc, update, delete
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_user, require_admin, require_superadmin
from app.core.defaults import DEFAULT_SYSTEM_SETTINGS
from app.models.user import User, UserRole
from app.models.user_limit import UserLimit
from app.models.conversion import ConversionJob, ConversionStatus
from app.models.usage_log import UsageLog
from app.models.system_setting import SystemSetting
from app.schemas.user import UserResponse, UserLimitResponse, UserCreate, AdminUserCreate
from app.services.user_service import user_service
from pydantic import BaseModel, EmailStr

router = APIRouter()


# ── Guards ────────────────────────────────────────────────────────────────────

# FEAT-SA01: guard admin & superadmin dari security.py (guard lokal lama hanya
# menerima "admin" dan akan menolak superadmin).


# ── Pydantic models (local, no circular imports) ──────────────────────────────

class AdminUserResponse(BaseModel):
    id: uuid.UUID
    email: str
    username: str
    full_name: Optional[str]
    role: str
    is_active: bool
    is_verified: bool
    created_at: datetime
    last_login: Optional[datetime]
    total_jobs: int = 0
    limits: Optional[UserLimitResponse] = None

    class Config:
        from_attributes = True


ADMIN_LIKE = ("admin", "superadmin")


def _role_str(user: User) -> str:
    return str(getattr(user.role, "value", user.role))


def _guard_target(actor: User, target: User) -> None:
    """FEAT-SA01: admin biasa tidak boleh menyentuh admin/superadmin lain.
    Superadmin boleh mengubah admin, tapi tidak superadmin lain."""
    if _role_str(target) not in ADMIN_LIKE:
        return
    if _role_str(actor) != "superadmin":
        raise HTTPException(status_code=403, detail="Hanya superadmin yang boleh mengubah akun admin")
    if _role_str(target) == "superadmin" and target.id != actor.id:
        raise HTTPException(status_code=403, detail="Superadmin tidak boleh mengubah superadmin lain")


class UpdateUserBody(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone_number: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    is_verified: Optional[bool] = None


class UpdateLimitsBody(BaseModel):
    max_conversions_per_day: Optional[int] = None
    max_conversions_per_month: Optional[int] = None
    max_file_size_mb: Optional[int] = None
    max_output_formats: Optional[int] = None
    allowed_formats: Optional[list[str]] = None
    use_ai_analysis: Optional[bool] = None


class StatsOverview(BaseModel):
    total_users: int
    active_users: int
    total_jobs: int
    jobs_today: int
    jobs_this_month: int
    pending_jobs: int
    failed_jobs: int
    completed_jobs: int


class ChartPoint(BaseModel):
    date: str
    conversions: int
    users: int


class FormatDist(BaseModel):
    name: str
    value: int


class ChartsResponse(BaseModel):
    daily: list[ChartPoint]
    formats: list[FormatDist]


class AdminJobResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    username: str
    original_filename: str
    output_format: str
    status: str
    created_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


class LogResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    username: str
    action: str
    ip_address: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class LogListResponse(BaseModel):
    total: int
    items: list[LogResponse]


class PresetPackage(BaseModel):
    name: str
    max_conversions_per_day: int
    max_conversions_per_month: int
    max_file_size_mb: int
    use_ai_analysis: bool
    allowed_formats: list[str]


class DefaultSettingsResponse(BaseModel):
    default_user_limits: dict
    conversion_settings: dict
    storage: dict
    ai: dict
    preset_packages: list[PresetPackage] = []


# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/stats/overview", response_model=StatsOverview, summary="Admin stats overview")
async def stats_overview(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)
    month_start = datetime(date.today().year, date.today().month, 1, tzinfo=timezone.utc)

    total_users = (await db.execute(select(func.count()).select_from(User))).scalar_one()
    active_users = (await db.execute(
        select(func.count()).select_from(User).where(User.is_active == True)
    )).scalar_one()
    total_jobs = (await db.execute(select(func.count()).select_from(ConversionJob))).scalar_one()
    jobs_today = (await db.execute(
        select(func.count()).select_from(ConversionJob).where(ConversionJob.created_at >= today_start)
    )).scalar_one()
    jobs_month = (await db.execute(
        select(func.count()).select_from(ConversionJob).where(ConversionJob.created_at >= month_start)
    )).scalar_one()
    pending = (await db.execute(
        select(func.count()).select_from(ConversionJob).where(
            ConversionJob.status.in_([ConversionStatus.PENDING.value, ConversionStatus.PROCESSING.value])
        )
    )).scalar_one()
    failed = (await db.execute(
        select(func.count()).select_from(ConversionJob).where(ConversionJob.status == ConversionStatus.FAILED.value)
    )).scalar_one()
    completed = (await db.execute(
        select(func.count()).select_from(ConversionJob).where(ConversionJob.status == ConversionStatus.COMPLETED.value)
    )).scalar_one()

    return StatsOverview(
        total_users=total_users,
        active_users=active_users,
        total_jobs=total_jobs,
        jobs_today=jobs_today,
        jobs_this_month=jobs_month,
        pending_jobs=pending,
        failed_jobs=failed,
        completed_jobs=completed,
    )


@router.get("/stats/charts", response_model=ChartsResponse, summary="Chart data (last 30 days)")
async def stats_charts(
    days: int = Query(default=30, ge=7, le=90),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    since = datetime.combine(
        date.today() - timedelta(days=days - 1),
        datetime.min.time(),
    ).replace(tzinfo=timezone.utc)

    jobs_result = await db.execute(
        select(
            func.date_trunc("day", ConversionJob.created_at).label("day"),
            func.count().label("cnt"),
        )
        .where(ConversionJob.created_at >= since)
        .group_by("day")
        .order_by("day")
    )
    jobs_by_day: dict[str, int] = {
        str(row.day.date()): row.cnt for row in jobs_result
    }

    users_result = await db.execute(
        select(
            func.date_trunc("day", User.created_at).label("day"),
            func.count().label("cnt"),
        )
        .where(User.created_at >= since)
        .group_by("day")
        .order_by("day")
    )
    users_by_day: dict[str, int] = {
        str(row.day.date()): row.cnt for row in users_result
    }

    daily = []
    for i in range(days):
        d = str(date.today() - timedelta(days=days - 1 - i))
        daily.append(ChartPoint(
            date=d,
            conversions=jobs_by_day.get(d, 0),
            users=users_by_day.get(d, 0),
        ))

    fmt_result = await db.execute(
        select(ConversionJob.method, func.count().label("cnt"))
        .where(ConversionJob.created_at >= since)
        .group_by(ConversionJob.method)
    )
    formats = [FormatDist(name=str(row.method).upper(), value=row.cnt) for row in fmt_result]

    return ChartsResponse(daily=daily, formats=formats)


# ── Jobs ──────────────────────────────────────────────────────────────────────

@router.get("/jobs", summary="All jobs (admin)")
async def list_all_jobs(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, le=200),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    user_id: Optional[uuid.UUID] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    query = (
        select(ConversionJob, User.username)
        .join(User, ConversionJob.user_id == User.id)
        .order_by(desc(ConversionJob.created_at))
    )
    if status_filter:
        query = query.where(ConversionJob.status == status_filter)
    if user_id:
        query = query.where(ConversionJob.user_id == user_id)

    total = (await db.execute(
        select(func.count()).select_from(query.subquery())
    )).scalar_one()

    result = await db.execute(query.offset(skip).limit(limit))
    rows = result.all()

    items = []
    for job, username in rows:
        # Derive output formats from the output_files JSON dict keys
        out_fmt = ", ".join((job.output_files or {}).keys()) or job.method or "—"
        items.append({
            "id": str(job.id),
            "user_id": str(job.user_id),
            "username": username,
            "original_filename": job.original_filename,
            "output_format": out_fmt,
            "status": job.status,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        })
    return {"total": total, "items": items}


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users", summary="List all users (admin)")
async def list_users(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, le=200),
    search: Optional[str] = Query(default=None),
    role: Optional[str] = Query(default=None),
    is_active: Optional[bool] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    query = select(User).options(selectinload(User.limits)).order_by(desc(User.created_at))
    if search:
        like = f"%{search}%"
        query = query.where(
            (User.email.ilike(like)) | (User.username.ilike(like)) | (User.full_name.ilike(like))
        )
    if role:
        query = query.where(User.role == role)
    if is_active is not None:
        query = query.where(User.is_active == is_active)

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    result = await db.execute(query.offset(skip).limit(limit))
    users = list(result.scalars().all())

    # Count jobs per user
    user_ids = [u.id for u in users]
    job_counts: dict[uuid.UUID, int] = {}
    if user_ids:
        jc_result = await db.execute(
            select(ConversionJob.user_id, func.count().label("cnt"))
            .where(ConversionJob.user_id.in_(user_ids))
            .group_by(ConversionJob.user_id)
        )
        job_counts = {row.user_id: row.cnt for row in jc_result}

    items = []
    for u in users:
        lim_data = None
        if u.limits:
            lim_data = {
                "max_conversions_per_day": u.limits.max_conversions_per_day,
                "max_conversions_per_month": u.limits.max_conversions_per_month,
                "max_file_size_mb": u.limits.max_file_size_mb,
                "max_output_formats": u.limits.max_output_formats,
                "allowed_formats": u.limits.allowed_formats,
                "use_ai_analysis": u.limits.use_ai_analysis,
            }
        items.append({
            "id": str(u.id),
            "email": u.email,
            "username": u.username,
            "full_name": u.full_name,
            "role": u.role,
            "is_active": u.is_active,
            "is_verified": u.is_verified,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "last_login": u.last_login.isoformat() if u.last_login else None,
            "total_jobs": job_counts.get(u.id, 0),
            "limits": lim_data,
        })
    return {"total": total, "items": items}


@router.put("/users/{user_id}", summary="Update user (admin)")
async def update_user(
    user_id: uuid.UUID,
    body: UpdateUserBody,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    _guard_target(actor, user)

    update_data = body.model_dump(exclude_unset=True)
    if "role" in update_data:
        if _role_str(actor) != "superadmin":
            raise HTTPException(status_code=403, detail="Hanya superadmin yang boleh mengubah role")
        update_data["role"] = UserRole(update_data["role"])
    for k, v in update_data.items():
        setattr(user, k, v)

    await db.commit()
    await db.refresh(user)
    return {"id": str(user.id), "email": user.email, "username": user.username, "role": user.role, "is_active": user.is_active}


@router.put("/users/{user_id}/limits", summary="Update user limits (admin)")
async def update_user_limits(
    user_id: uuid.UUID,
    body: UpdateLimitsBody,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(
        select(UserLimit).where(UserLimit.user_id == user_id)
    )
    lim = result.scalar_one_or_none()
    if not lim:
        # create default limits if missing
        lim = UserLimit(user_id=user_id)
        db.add(lim)
        await db.flush()

    update_data = body.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        setattr(lim, k, v)

    await db.commit()
    await db.refresh(lim)
    return {
        "max_conversions_per_day": lim.max_conversions_per_day,
        "max_conversions_per_month": lim.max_conversions_per_month,
        "max_file_size_mb": lim.max_file_size_mb,
        "max_output_formats": lim.max_output_formats,
        "allowed_formats": lim.allowed_formats,
        "use_ai_analysis": lim.use_ai_analysis,
    }


@router.post("/users", response_model=UserResponse, summary="Create new user (admin)")
async def create_user_admin(
    user: AdminUserCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Admin only — create a new user. Pembuatan akun admin/superadmin hanya oleh superadmin."""
    target_role = user.role or UserRole.USER
    target_role_str = str(getattr(target_role, "value", target_role))
    if target_role_str in ADMIN_LIKE and _role_str(admin) != "superadmin":
        raise HTTPException(status_code=403, detail="Hanya superadmin yang boleh membuat akun admin")
    user_obj = await user_service.create(db, user, role=target_role)
    return user_obj



@router.post("/users/{user_id}/suspend", summary="Toggle user suspension (admin)")
async def suspend_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot suspend yourself")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    _guard_target(admin, user)
    user.is_active = not user.is_active
    await db.commit()
    return {"id": str(user.id), "is_active": user.is_active}


@router.delete("/users/{user_id}", status_code=204, summary="Delete user (admin)")
async def delete_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    _guard_target(admin, user)
    await db.delete(user)
    await db.commit()


# ── Activity Logs ─────────────────────────────────────────────────────────────

@router.get("/logs", summary="Activity logs (admin)")
async def list_logs(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, le=500),
    user_id: Optional[uuid.UUID] = Query(default=None),
    action: Optional[str] = Query(default=None),
    date_from: Optional[str] = Query(default=None, description="ISO date YYYY-MM-DD"),
    date_to: Optional[str] = Query(default=None, description="ISO date YYYY-MM-DD"),
    ip_address: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    query = (
        select(UsageLog, User.username)
        .join(User, UsageLog.user_id == User.id)
        .order_by(desc(UsageLog.created_at))
    )
    if user_id:
        query = query.where(UsageLog.user_id == user_id)
    if action:
        query = query.where(UsageLog.action == action)
    if ip_address:
        query = query.where(UsageLog.ip_address.ilike(f"%{ip_address}%"))
    if date_from:
        try:
            dt_from = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
            query = query.where(UsageLog.created_at >= dt_from)
        except ValueError:
            pass
    if date_to:
        try:
            dt_to = datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc) + timedelta(days=1)
            query = query.where(UsageLog.created_at < dt_to)
        except ValueError:
            pass

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    result = await db.execute(query.offset(skip).limit(limit))
    rows = result.all()

    items = []
    for log, username in rows:
        items.append({
            "id": str(log.id),
            "user_id": str(log.user_id),
            "username": username,
            "action": log.action,
            "ip_address": log.ip_address,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        })

    return {"total": total, "items": items}


# ── System Settings / Defaults ────────────────────────────────────────────────

PRESET_PACKAGES_KEY = "preset_packages"

_DEFAULT_PRESETS = [
    {
        "name": "Free",
        "max_conversions_per_day": 3,
        "max_conversions_per_month": 30,
        "max_file_size_mb": 5,
        "use_ai_analysis": False,
        "allowed_formats": ["stl"],
    },
    {
        "name": "Basic",
        "max_conversions_per_day": 10,
        "max_conversions_per_month": 100,
        "max_file_size_mb": 10,
        "use_ai_analysis": True,
        "allowed_formats": ["stl", "svg", "dxf"],
    },
    {
        "name": "Pro",
        "max_conversions_per_day": 50,
        "max_conversions_per_month": 500,
        "max_file_size_mb": 25,
        "use_ai_analysis": True,
        "allowed_formats": ["stl", "svg", "dxf"],
    },
]


async def _get_setting(db: AsyncSession, key: str) -> Any:
    result = await db.execute(select(SystemSetting).where(SystemSetting.key == key))
    row = result.scalar_one_or_none()
    return row.value if row else None


async def _set_setting(db: AsyncSession, key: str, value: Any, admin_id: uuid.UUID) -> None:
    result = await db.execute(select(SystemSetting).where(SystemSetting.key == key))
    row = result.scalar_one_or_none()
    if row:
        row.value = value
        row.updated_by = admin_id
    else:
        db.add(SystemSetting(key=key, value=value, updated_by=admin_id))
    await db.commit()


@router.get("/settings/defaults", response_model=DefaultSettingsResponse, summary="Get all default settings")
async def get_defaults(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    keys = ["default_user_limits", "conversion_settings", "storage", "ai"]
    data: dict[str, Any] = {}
    for key in keys:
        val = await _get_setting(db, key)
        data[key] = val if val is not None else DEFAULT_SYSTEM_SETTINGS.get(key, {})

    presets_raw = await _get_setting(db, PRESET_PACKAGES_KEY)
    presets = presets_raw if presets_raw is not None else _DEFAULT_PRESETS

    return DefaultSettingsResponse(
        default_user_limits=data["default_user_limits"],
        conversion_settings=data["conversion_settings"],
        storage=data["storage"],
        ai=data["ai"],
        preset_packages=[PresetPackage(**p) for p in presets],
    )


@router.put("/settings/defaults", summary="Update default settings")
async def update_defaults(
    body: dict,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_superadmin),
):
    allowed_keys = {"default_user_limits", "conversion_settings", "storage", "ai"}
    for key in body:
        if key not in allowed_keys:
            raise HTTPException(status_code=400, detail=f"Unknown setting key: {key}")
        await _set_setting(db, key, body[key], admin.id)
    return {"updated": list(body.keys())}


# ── Preset Packages CRUD ──────────────────────────────────────────────────────

@router.get("/settings/presets", summary="List preset packages")
async def list_presets(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    raw = await _get_setting(db, PRESET_PACKAGES_KEY)
    return raw if raw is not None else _DEFAULT_PRESETS


@router.put("/settings/presets", summary="Replace all preset packages")
async def update_presets(
    presets: list[PresetPackage],
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_superadmin),
):
    data = [p.model_dump() for p in presets]
    await _set_setting(db, PRESET_PACKAGES_KEY, data, admin.id)
    return data
