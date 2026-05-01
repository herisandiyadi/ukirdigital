import io, uuid, zipfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status, BackgroundTasks, Request
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.conversion import ConversionMethod
from app.schemas.conversion import (
    ConversionJobResponse,
    ConversionJobListResponse,
    AnalyzeResponse,
    LimitsStatusResponse,
)
from app.services.conversion_service import conversion_service
from app.services.ai_service import ai_service
from app.services.job_runner import process_job
from app.utils.file_handler import save_upload_file, delete_file

router = APIRouter()


# ── GET /limits  (usage vs limits for current user) ──────────────────────────

@router.get("/limits", response_model=LimitsStatusResponse, summary="Cek usage & limits konversi")
async def get_limits(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return berapa konversi sudah dipakai hari ini / bulan ini vs batas akun."""
    lim = current_user.limits
    status_data = await conversion_service.get_limits_status(db, current_user.id, lim)
    from app.core.defaults import DEFAULT_SYSTEM_SETTINGS
    defaults = DEFAULT_SYSTEM_SETTINGS["default_user_limits"]
    status_data["max_file_size_mb"]    = lim.max_file_size_mb    if lim else defaults["max_file_size_mb"]
    status_data["max_output_formats"]  = lim.max_output_formats  if lim else defaults["max_output_formats"]
    status_data["allowed_formats"]     = (lim.allowed_formats or defaults["allowed_formats"]) if lim else defaults["allowed_formats"]
    status_data["use_ai_analysis"]     = lim.use_ai_analysis     if lim else defaults["use_ai_analysis"]
    return LimitsStatusResponse(**status_data)


# ── POST /analyze  (upload + Claude analysis only) ───────────────────────────

@router.post("/analyze", response_model=AnalyzeResponse, summary="Upload gambar + analisis AI")
async def analyze_image(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload gambar dan dapatkan analisis AI tanpa memulai konversi."""
    use_ai = current_user.limits.use_ai_analysis if current_user.limits else False
    if not use_ai:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akun Anda tidak memiliki akses AI analysis",
        )
    saved_path, original_name, size_bytes = await save_upload_file(file)
    try:
        result = await ai_service.analyze_image(saved_path)
    finally:
        delete_file(saved_path)
    return AnalyzeResponse(filename=original_name, analysis=result)


# ── POST /  (upload + konversi) ──────────────────────────────────────────────

@router.post(
    "",
    response_model=ConversionJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload gambar & mulai konversi 3D",
)
async def create_conversion(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    formats: str = Form(default="stl"),           # comma-separated: "stl,svg,dxf"
    method: ConversionMethod = Form(default=ConversionMethod.RELIEF),
    threshold: Optional[int] = Form(default=None),
    max_height_mm: Optional[float] = Form(default=None),
    base_thickness_mm: Optional[float] = Form(default=None),
    scale_mm_per_px: Optional[float] = Form(default=None),
    resolution: Optional[int] = Form(default=None),
    smoothing_blur_radius: Optional[float] = Form(default=None),
    outline_type: Optional[str] = Form(default=None),        # 'rectangle' or 'circle'
    outline_thickness: Optional[float] = Form(default=None),  # in mm
    ball_radius_mm: Optional[float] = Form(default=None),    # Ball nose radius (R3/2 dari diameter)
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    requested_formats = [f.strip().lower() for f in formats.split(",") if f.strip()]

    # ── Validate user limits ────────────────────────────────────────────────
    lim = current_user.limits
    if lim:
        # Daily limit
        used_today = await conversion_service.count_today(db, current_user.id)
        if used_today >= lim.max_conversions_per_day:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Batas konversi harian ({lim.max_conversions_per_day}) sudah tercapai. Coba lagi besok.",
            )
        # Monthly limit
        used_month = await conversion_service.count_this_month(db, current_user.id)
        if used_month >= lim.max_conversions_per_month:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Batas konversi bulanan ({lim.max_conversions_per_month}) sudah tercapai.",
            )
        # Format count
        if len(requested_formats) > lim.max_output_formats:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Maksimum {lim.max_output_formats} format output per konversi.",
            )
        # Allowed formats
        for fmt in requested_formats:
            if fmt not in (lim.allowed_formats or []):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Format '{fmt}' tidak diizinkan untuk akun Anda.",
                )

    saved_path, original_name, file_size_bytes = await save_upload_file(file)

    settings_override: dict = {}
    if threshold         is not None: settings_override["threshold"]         = threshold
    if max_height_mm     is not None: settings_override["max_height_mm"]     = max_height_mm
    if base_thickness_mm is not None: settings_override["base_thickness_mm"] = base_thickness_mm
    if scale_mm_per_px   is not None: settings_override["scale_mm_per_px"]   = scale_mm_per_px
    if resolution        is not None: settings_override["resolution"]        = resolution
    if smoothing_blur_radius is not None: settings_override["smoothing_blur_radius"] = smoothing_blur_radius
    if outline_type      is not None: settings_override["outline_type"]      = outline_type
    if outline_thickness is not None: settings_override["outline_thickness"] = outline_thickness
    if ball_radius_mm    is not None: settings_override["ball_radius_mm"]    = ball_radius_mm
    
    # Calculate stepover: 10% dari ball radius
    if ball_radius_mm is not None:
        stepover_mm = ball_radius_mm * 0.1  # 10% stepover
        settings_override["stepover_mm"] = stepover_mm
    
    settings_override["method"] = method.value

    job = await conversion_service.create(
        db=db,
        user_id=current_user.id,
        original_filename=original_name,
        original_file_path=saved_path,
        file_size_bytes=file_size_bytes,
        method=method,
        settings_override=settings_override,
    )

    use_ai = lim.use_ai_analysis if lim else True
    background_tasks.add_task(process_job, job.id, requested_formats, use_ai)

    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    background_tasks.add_task(conversion_service.log_action, db, current_user.id, job.id, "convert", ip, ua)

    return job


# ── GET /  (list jobs) ───────────────────────────────────────────────────────

@router.get("", response_model=ConversionJobListResponse, summary="List semua job konversi")
async def list_conversions(
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total, items = await conversion_service.get_all(db, current_user.id, skip=skip, limit=limit)
    return ConversionJobListResponse(total=total, items=items)


# ── GET /{job_id}  (status polling) ──────────────────────────────────────────

@router.get("/{job_id}", response_model=ConversionJobResponse, summary="Status / polling job konversi")
async def get_conversion(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = await conversion_service.get_by_id(db, job_id, current_user.id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job tidak ditemukan")
    return job


# ── GET /{job_id}/download/{fmt}  (download single file) ─────────────────────

@router.get("/{job_id}/download/{fmt}", summary="Download satu file output")
async def download_file(
    job_id: uuid.UUID,
    fmt: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = await conversion_service.get_by_id(db, job_id, current_user.id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job tidak ditemukan")

    fmt = fmt.lower()
    output_files: dict = job.output_files or {}
    if fmt not in output_files:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Format '{fmt}' tidak tersedia untuk job ini",
        )

    file_path = output_files[fmt]
    if not Path(file_path).exists():
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="File sudah dihapus dari server")

    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    await conversion_service.log_action(db, current_user.id, job.id, "download", ip, ua)

    stem = Path(job.original_filename).stem
    download_name = f"{stem}_{job_id.hex[:8]}.{fmt}"
    return FileResponse(file_path, filename=download_name, media_type="application/octet-stream")


# ── GET /{job_id}/download-all  (ZIP) ────────────────────────────────────────

@router.get("/{job_id}/download-all", summary="Download semua output sebagai ZIP")
async def download_all(
    job_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = await conversion_service.get_by_id(db, job_id, current_user.id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job tidak ditemukan")

    output_files: dict = job.output_files or {}
    available = {fmt: p for fmt, p in output_files.items() if Path(p).exists()}
    if not available:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tidak ada file output yang tersedia")

    stem = Path(job.original_filename).stem
    zip_filename = f"{stem}_outputs_{job_id.hex[:8]}.zip"
    
    # Create ZIP buffer
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for fmt, path in available.items():
            if Path(path).exists():
                arcname = f"{stem}_{job_id.hex[:8]}.{fmt}"
                zf.write(path, arcname=arcname)
    buf.seek(0)

    # Log the download action
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    await conversion_service.log_action(db, current_user.id, job.id, "download-all", ip, ua)

    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_filename}"'},
    )


# ── DELETE /{job_id} ──────────────────────────────────────────────────────────

@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Hapus job konversi")
async def delete_conversion(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = await conversion_service.get_by_id(db, job_id, current_user.id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job tidak ditemukan")
    for path in (job.output_files or {}).values():
        delete_file(path)
    delete_file(job.original_file_path)
    await conversion_service.log_action(db, current_user.id, job.id, "delete")
    await db.delete(job)
    await db.commit()
