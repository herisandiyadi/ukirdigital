import uuid
from typing import Sequence

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.conversion import ConversionJob
from app.services.conversion_service import conversion_service


async def process_job(job_id: uuid.UUID, requested_formats: Sequence[str], use_ai: bool) -> None:
    """Background-task entrypoint with its own DB session."""
    async with AsyncSessionLocal() as db:
        r = await db.execute(select(ConversionJob).where(ConversionJob.id == job_id))
        job = r.scalar_one_or_none()
        if job is None:
            return
        await conversion_service.process(db, job, list(requested_formats), use_ai)
