import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import FileResponse
from pathlib import Path

from app.core.security import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.services.conversion_service import conversion_service
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()

MIME_TYPES = {
    "stl": "model/stl",
    "svg": "image/svg+xml",
    "dxf": "application/dxf",
}


@router.get("/download/{job_id}/{fmt}")
async def download_output(
    job_id: uuid.UUID,
    fmt: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download a specific output format file (stl / svg / dxf)."""
    fmt = fmt.lower()
    job = await conversion_service.get_by_id(db, job_id, current_user.id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversion job not found")

    output_files: dict = job.output_files or {}
    if fmt not in output_files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Format '{fmt}' not available for this job",
        )

    file_path = Path(output_files[fmt])
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Output file not found on disk")

    # Log the download
    ip = request.client.host if request.client else None
    await conversion_service.log_action(db, current_user.id, job.id, "download", ip)

    return FileResponse(
        path=str(file_path),
        filename=f"{Path(job.original_filename).stem}.{fmt}",
        media_type=MIME_TYPES.get(fmt, "application/octet-stream"),
    )


@router.get("/download/{conversion_id}")
async def download_output(
    conversion_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download the converted output file."""
    conversion = await conversion_service.get_by_id(db, conversion_id, current_user.id)
    if not conversion:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversion not found")
    if not conversion.output_file_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Output file not ready yet"
        )

    output_path = Path(conversion.output_file_path)
    if not output_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Output file not found on disk"
        )

    return FileResponse(
        path=str(output_path),
        filename=conversion.output_filename,
        media_type="application/octet-stream",
    )
