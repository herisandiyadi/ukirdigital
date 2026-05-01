"""
Maintenance service — APScheduler background tasks.

Tasks:
  • Every 10 min  : time out stuck jobs (PROCESSING > 30 min)
  • Every hour    : send usage-limit warnings (≥80% daily) via email + WS
  • Daily 02:00   : delete output files older than `auto_delete_after_days`
  • Daily 02:30   : recalculate per-user storage usage
"""
import asyncio
import logging
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import select, and_, update, func

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.defaults import DEFAULT_SYSTEM_SETTINGS
from app.models.conversion import ConversionJob, ConversionStatus
from app.models.system_setting import SystemSetting

logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_setting_value(db, key: str):
    result = await db.execute(select(SystemSetting).where(SystemSetting.key == key))
    row = result.scalar_one_or_none()
    return row.value if row else DEFAULT_SYSTEM_SETTINGS.get(key)


# ── Task 1 — Timeout stuck jobs ───────────────────────────────────────────────

async def task_timeout_stuck_jobs() -> None:
    """Mark jobs stuck in PROCESSING for > 30 minutes as FAILED."""
    cutoff = datetime.now(tz=timezone.utc) - timedelta(minutes=30)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ConversionJob).where(
                and_(
                    ConversionJob.status == ConversionStatus.PROCESSING.value,
                    ConversionJob.created_at < cutoff,
                )
            )
        )
        stuck = list(result.scalars().all())

        if not stuck:
            return

        logger.info("[maintenance] Found %d stuck jobs — marking as FAILED", len(stuck))

        for job in stuck:
            job.status = ConversionStatus.FAILED.value
            job.error_message = "Job timed out after 30 minutes (auto-cleanup)"
            job.completed_at = datetime.now(tz=timezone.utc)

            # Push WS notification if possible (best-effort)
            try:
                from app.api.websocket import notify_job_failed
                await notify_job_failed(str(job.user_id), str(job.id), "Job timed out")
            except Exception:
                pass

        await db.commit()
        logger.info("[maintenance] Marked %d jobs as FAILED", len(stuck))


# ── Task 2 — Delete old output files ─────────────────────────────────────────

async def task_cleanup_old_files() -> None:
    """Delete output files older than the configured auto_delete_after_days."""
    async with AsyncSessionLocal() as db:
        storage_cfg = await _get_setting_value(db, "storage")

    delete_after_days: int = (storage_cfg or {}).get(
        "auto_delete_after_days",
        DEFAULT_SYSTEM_SETTINGS["storage"]["auto_delete_after_days"],
    )
    cutoff_ts = datetime.now(tz=timezone.utc) - timedelta(days=delete_after_days)

    output_dir = Path(settings.OUTPUT_DIR)
    if not output_dir.exists():
        return

    deleted_count = 0
    total_bytes = 0

    for f in output_dir.rglob("*"):
        if not f.is_file():
            continue
        mtime = datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc)
        if mtime < cutoff_ts:
            size = f.stat().st_size
            try:
                f.unlink()
                deleted_count += 1
                total_bytes += size
            except OSError as exc:
                logger.warning("[maintenance] Could not delete %s: %s", f, exc)

    if deleted_count:
        logger.info(
            "[maintenance] Deleted %d old files (%.1f MB)",
            deleted_count,
            total_bytes / 1_048_576,
        )

    # Also remove input uploads older than delete_after_days
    upload_dir = Path(settings.UPLOAD_DIR)
    if upload_dir.exists():
        for f in upload_dir.rglob("*"):
            if not f.is_file():
                continue
            mtime = datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc)
            if mtime < cutoff_ts:
                try:
                    f.unlink()
                except OSError:
                    pass

    # Mark completed/failed jobs whose files no longer exist as "files_deleted"
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ConversionJob).where(
                and_(
                    ConversionJob.status == ConversionStatus.COMPLETED,
                    ConversionJob.created_at < cutoff_ts,
                )
            )
        )
        old_jobs = list(result.scalars().all())
        for job in old_jobs:
            if job.output_file_path and not Path(job.output_file_path).exists():
                job.output_file_path = None  # signal that file was removed
        await db.commit()


# ── Task 3 — Usage limit warnings ────────────────────────────────────────────

async def task_usage_warnings() -> None:
    """
    For every active user: if daily usage ≥ 80% of their limit,
    send an email + WebSocket notification (once per day).
    """
    from app.models.user import User
    from app.models.user_limit import UserLimit
    from app.models.conversion import ConversionJob, ConversionStatus
    from app.services.email_service import send_limit_warning_email
    from app.api.websocket import notify_usage_warning

    today_start = datetime.combine(
        datetime.now(tz=timezone.utc).date(), datetime.min.time()
    ).replace(tzinfo=timezone.utc)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(User, UserLimit)
            .join(UserLimit, User.id == UserLimit.user_id, isouter=True)
            .where(User.is_active == True)
        )
        rows = result.all()

        defaults = DEFAULT_SYSTEM_SETTINGS["default_user_limits"]

        for user, lim in rows:
            max_day = lim.max_conversions_per_day if lim else defaults["max_conversions_per_day"]

            count_result = await db.execute(
                select(func.count()).select_from(ConversionJob).where(
                    and_(
                        ConversionJob.user_id == user.id,
                        ConversionJob.created_at >= today_start,
                        ConversionJob.status != ConversionStatus.FAILED,
                    )
                )
            )
            used_today = count_result.scalar_one()

            if max_day > 0 and used_today / max_day >= 0.8:
                # Best-effort: WS + email
                try:
                    await notify_usage_warning(str(user.id), used_today, max_day, "daily")
                except Exception:
                    pass
                try:
                    send_limit_warning_email(user.email, user.username, used_today, max_day, "daily")
                except Exception:
                    pass


# ── Task 4 — Storage calculation ─────────────────────────────────────────────

async def task_calculate_storage() -> None:
    """Log total storage used across uploads/ and outputs/ directories."""
    def dir_size(path: Path) -> int:
        return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())

    uploads_bytes = dir_size(Path(settings.UPLOAD_DIR)) if Path(settings.UPLOAD_DIR).exists() else 0
    outputs_bytes = dir_size(Path(settings.OUTPUT_DIR)) if Path(settings.OUTPUT_DIR).exists() else 0
    total_mb = (uploads_bytes + outputs_bytes) / 1_048_576

    logger.info(
        "[maintenance] Storage: uploads=%.1f MB  outputs=%.1f MB  total=%.1f MB",
        uploads_bytes / 1_048_576,
        outputs_bytes / 1_048_576,
        total_mb,
    )


# ── Scheduler setup ───────────────────────────────────────────────────────────

def create_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone="UTC")

    # Stuck-job timeout — every 10 minutes
    scheduler.add_job(
        task_timeout_stuck_jobs,
        trigger=IntervalTrigger(minutes=10),
        id="timeout_stuck_jobs",
        replace_existing=True,
        max_instances=1,
    )

    # Old-file cleanup — daily at 02:00 UTC
    scheduler.add_job(
        task_cleanup_old_files,
        trigger=CronTrigger(hour=2, minute=0),
        id="cleanup_old_files",
        replace_existing=True,
        max_instances=1,
    )

    # Storage calculation — daily at 02:30 UTC
    scheduler.add_job(
        task_calculate_storage,
        trigger=CronTrigger(hour=2, minute=30),
        id="calculate_storage",
        replace_existing=True,
        max_instances=1,
    )

    # Usage warnings — every hour
    scheduler.add_job(
        task_usage_warnings,
        trigger=IntervalTrigger(hours=1),
        id="usage_warnings",
        replace_existing=True,
        max_instances=1,
    )

    return scheduler


# Singleton
scheduler = create_scheduler()
