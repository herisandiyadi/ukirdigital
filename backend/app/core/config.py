from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Ukir Digital"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5432/png_converter_db"

    # JWT — BUG-S01: tanpa default. Wajib diisi lewat env/.env; app menolak
    # start jika kosong atau terlalu pendek, agar token tidak bisa dipalsukan.
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15        # 15 menit
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    EMAIL_VERIFY_TOKEN_EXPIRE_HOURS: int = 24
    RESET_PASSWORD_TOKEN_EXPIRE_HOURS: int = 1

    # Cookie refresh token (BUG-S04): httpOnly, tidak bisa dibaca JS.
    # COOKIE_SECURE=true di HTTPS (produksi / ngrok).
    COOKIE_SECURE: bool = False
    REFRESH_COOKIE_NAME: str = "refresh_token"

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "https://defile-demanding-concert.ngrok-free.dev",
    ]

    # AI (OpenAI-compatible). Nama ANTHROPIC_API_KEY dipertahankan untuk kompatibilitas.
    ANTHROPIC_API_KEY: str = ""
    AI_BASE_URL: str = "https://ai.sumopod.com/v1"  # OpenAI-compatible endpoint

    # File storage
    UPLOAD_DIR: str = "uploads"
    OUTPUT_DIR: str = "outputs"
    MAX_FILE_SIZE_MB: int = 10

    # Allowed formats
    ALLOWED_OUTPUT_FORMATS: List[str] = ["stl", "svg", "dxf"]

    # Email (SMTP) — isi di .env, mock jika kosong
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    EMAILS_FROM_EMAIL: str = "noreply@pngconverter.app"
    EMAILS_FROM_NAME: str = "Ukir Digital"
    
    # WhatsApp (Twilio)
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_WHATSAPP_NUMBER: str = ""  # Format: whatsapp:+62812345678
    
    FRONTEND_URL: str = "http://localhost:5173"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

if len(settings.SECRET_KEY or "") < 32:
    raise RuntimeError(
        "SECRET_KEY wajib diisi minimal 32 karakter (set di .env / environment)."
    )
