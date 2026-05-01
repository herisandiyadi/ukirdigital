import os, uuid
from pathlib import Path
from fastapi import UploadFile, HTTPException, status
from app.core.config import settings
from app.core.defaults import DEFAULT_SYSTEM_SETTINGS
from app.core.database import AsyncSessionLocal
from sqlalchemy import select
from app.models.system_setting import SystemSetting

ALLOWED_MIME_TYPES: set = set(DEFAULT_SYSTEM_SETTINGS["storage"]["allowed_input_types"])


async def _get_max_upload_bytes() -> int:
  """Resolve max upload size from system settings (Admin) or env.

  Priority:
    1) system_settings.storage.max_upload_file_mb (if exists)
    2) settings.MAX_FILE_SIZE_MB from .env/config
  """
  # Default from env/config
  max_mb = settings.MAX_FILE_SIZE_MB

  async with AsyncSessionLocal() as db:
      res = await db.execute(select(SystemSetting).where(SystemSetting.key == "storage"))
      row = res.scalar_one_or_none()
      if row and isinstance(row.value, dict):
          try:
              val = int(row.value.get("max_upload_file_mb") or max_mb)
              if val > 0:
                  max_mb = val
          except (TypeError, ValueError):
              pass

  return max_mb * 1024 * 1024

PNG_MAGIC  = b"\x89PNG\r\n\x1a\n"
JPEG_MAGIC = b"\xff\xd8\xff"
WEBP_RIFF  = b"RIFF"
WEBP_MARK  = b"WEBP"

def _valid_magic(data: bytes, mime: str) -> bool:
    if mime == "image/png":
        return data[:8] == PNG_MAGIC
    if mime in ("image/jpeg", "image/jpg"):
        return data[:3] == JPEG_MAGIC
    if mime == "image/webp":
        return data[:4] == WEBP_RIFF and data[8:12] == WEBP_MARK
    return False

async def save_upload_file(file: UploadFile) -> tuple[str, str, int]:
    """Validate + save upload. Returns (saved_path, original_name, size_bytes)."""
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Tipe file tidak didukung: {content_type}. Diizinkan: {sorted(ALLOWED_MIME_TYPES)}",
        )
    contents = await file.read()
    size = len(contents)
    if size == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File kosong")
    max_size_bytes = await _get_max_upload_bytes()
    max_mb_effective = max_size_bytes // (1024 * 1024)
    if size > max_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File terlalu besar. Maksimum: {max_mb_effective} MB",
        )
    if not _valid_magic(contents, content_type):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Konten file tidak cocok dengan tipe yang dideklarasikan",
        )
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    suffix = Path(file.filename or "upload").suffix or ".png"
    unique_name = f"{uuid.uuid4().hex}{suffix}"
    save_path = str(upload_dir / unique_name)
    with open(save_path, "wb") as f:
        f.write(contents)
    return save_path, file.filename or unique_name, size

def delete_file(path: str) -> None:
    try:
        os.remove(path)
    except (FileNotFoundError, TypeError):
        pass
