import time
import uuid
from pathlib import Path
from datetime import datetime, timezone, date
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from app.models.conversion import ConversionJob, ConversionStatus, ConversionMethod
from app.models.usage_log import UsageLog
from app.services.ai_service import ai_service
from app.utils.converters import convert_png_to_stl, convert_png_to_svg, convert_png_to_dxf
from app.core.config import settings
from app.core.defaults import DEFAULT_SYSTEM_SETTINGS

CONV_DEFAULTS = DEFAULT_SYSTEM_SETTINGS["conversion_settings"]


class ConversionService:

    async def get_all(
        self, db: AsyncSession, user_id: uuid.UUID, skip: int = 0, limit: int = 20
    ) -> tuple[int, list[ConversionJob]]:
        total_r = await db.execute(
            select(func.count()).select_from(ConversionJob).where(ConversionJob.user_id == user_id)
        )
        total = total_r.scalar_one()
        result = await db.execute(
            select(ConversionJob)
            .where(ConversionJob.user_id == user_id)
            .order_by(ConversionJob.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return total, list(result.scalars().all())

    async def get_by_id(
        self, db: AsyncSession, job_id: uuid.UUID, user_id: uuid.UUID
    ) -> ConversionJob | None:
        result = await db.execute(
            select(ConversionJob).where(
                ConversionJob.id == job_id,
                ConversionJob.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def count_today(self, db: AsyncSession, user_id: uuid.UUID) -> int:
        """Count non-failed jobs created today (UTC) for a user."""
        today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)
        result = await db.execute(
            select(func.count())
            .select_from(ConversionJob)
            .where(
                and_(
                    ConversionJob.user_id == user_id,
                    ConversionJob.created_at >= today_start,
                    ConversionJob.status != ConversionStatus.FAILED.value,
                )
            )
        )
        return result.scalar_one()

    async def count_this_month(self, db: AsyncSession, user_id: uuid.UUID) -> int:
        """Count non-failed jobs created this calendar month (UTC) for a user."""
        today = date.today()
        month_start = datetime(today.year, today.month, 1, tzinfo=timezone.utc)
        result = await db.execute(
            select(func.count())
            .select_from(ConversionJob)
            .where(
                and_(
                    ConversionJob.user_id == user_id,
                    ConversionJob.created_at >= month_start,
                    ConversionJob.status != ConversionStatus.FAILED.value,
                )
            )
        )
        return result.scalar_one()

    async def get_limits_status(
        self, db: AsyncSession, user_id: uuid.UUID, user_limits
    ) -> dict:
        """Return usage-vs-limits summary dict for the frontend."""
        used_today = await self.count_today(db, user_id)
        used_month = await self.count_this_month(db, user_id)
        defaults = DEFAULT_SYSTEM_SETTINGS["default_user_limits"]
        max_day   = user_limits.max_conversions_per_day   if user_limits else defaults["max_conversions_per_day"]
        max_month = user_limits.max_conversions_per_month if user_limits else defaults["max_conversions_per_month"]
        return {
            "used_today":        used_today,
            "max_per_day":       max_day,
            "remaining_today":   max(0, max_day - used_today),
            "used_this_month":   used_month,
            "max_per_month":     max_month,
            "remaining_month":   max(0, max_month - used_month),
            "daily_limit_hit":   used_today  >= max_day,
            "monthly_limit_hit": used_month  >= max_month,
        }

    async def create(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        original_filename: str,
        original_file_path: str,
        file_size_bytes: int,
        method: ConversionMethod = ConversionMethod.RELIEF,
        settings_override: dict[str, Any] | None = None,
    ) -> ConversionJob:
        job_settings = {
            "threshold": CONV_DEFAULTS["default_threshold"],
            "max_height_mm": CONV_DEFAULTS["default_max_height_mm"],
            "base_thickness_mm": CONV_DEFAULTS["default_base_thickness_mm"],
            "scale_mm_per_px": CONV_DEFAULTS["default_scale_mm_per_px"],
            "resolution": CONV_DEFAULTS["default_resolution"],
            # Quality defaults
            "smoothing_blur_radius": CONV_DEFAULTS.get("default_smoothing_blur_radius", 1.0),
            # Relief detail mode: 'grayscale' retains more detail than 'binary'
            "relief_detail": CONV_DEFAULTS.get("default_relief_detail", "grayscale"),
            # Light preprocessing to enhance details
            "contrast_stretch": CONV_DEFAULTS.get("default_contrast_stretch", True),
            "contrast_low_pct": CONV_DEFAULTS.get("default_contrast_low_pct", 2.0),
            "contrast_high_pct": CONV_DEFAULTS.get("default_contrast_high_pct", 98.0),
            "gamma": CONV_DEFAULTS.get("default_gamma", 1.0),
        }
        if settings_override:
            job_settings.update(settings_override)

        job = ConversionJob(
            user_id=user_id,
            original_filename=original_filename,
            original_file_path=original_file_path,
            file_size_bytes=file_size_bytes,
            method=method.value if hasattr(method, "value") else method,
            settings=job_settings,
            status=ConversionStatus.PENDING.value,
            output_files={},
        )
        db.add(job)
        await db.commit()
        await db.refresh(job)
        return job

    async def process(
        self,
        db: AsyncSession,
        job: ConversionJob,
        requested_formats: list[str],
        use_ai: bool = True,
    ) -> ConversionJob:
        """Run AI analysis (optional) + multi-format conversion."""
        start_time = time.time()

        job.status = ConversionStatus.PROCESSING.value
        await db.commit()

        try:
            # ── Step 1: AI Analysis ──────────────────────────
            if use_ai and settings.ANTHROPIC_API_KEY:
                ai_result = await ai_service.analyze_image(job.original_file_path)
                job.ai_analysis = ai_result
            else:
                job.ai_analysis = None

            # ── Step 2: Convert to each requested format ─────
            output_dir = Path(settings.OUTPUT_DIR)
            output_dir.mkdir(exist_ok=True)
            stem = Path(job.original_filename).stem
            safe_stem = "".join(c if c.isalnum() or c in "-_" else "_" for c in stem)
            job_id_short = str(job.id)[:8]

            output_files: dict[str, str] = {}
            conv_settings = job.settings or {}

            format_handlers = {
                "stl": convert_png_to_stl,
                "svg": convert_png_to_svg,
                "dxf": convert_png_to_dxf,
            }

            for fmt in requested_formats:
                if fmt not in format_handlers:
                    continue
                out_filename = f"{safe_stem}_{job_id_short}.{fmt}"
                out_path = str(output_dir / out_filename)
                format_handlers[fmt](job.original_file_path, out_path, conv_settings)
                output_files[fmt] = out_path

            job.output_files = output_files
            job.status = ConversionStatus.COMPLETED.value
            job.completed_at = datetime.now(timezone.utc)

        except Exception as exc:
            job.status = ConversionStatus.FAILED.value
            job.error_message = str(exc)

        finally:
            job.processing_time_seconds = round(time.time() - start_time, 3)
            await db.commit()
            await db.refresh(job)

        return job

    async def log_action(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        job_id: uuid.UUID | None,
        action: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> None:
        log = UsageLog(
            user_id=user_id,
            job_id=job_id,
            action=action,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        db.add(log)
        await db.commit()


conversion_service = ConversionService()
