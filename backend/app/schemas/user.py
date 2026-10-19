import re
import uuid
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List, Any
from datetime import datetime

from app.models.user import UserRole


class UserBase(BaseModel):
    email: EmailStr
    username: str
    full_name: Optional[str] = None
    phone_number: Optional[str] = None


class UserCreate(UserBase):
    password: str

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password minimal 8 karakter")
        return v

    @field_validator("username")
    @classmethod
    def username_alphanumeric(cls, v: str) -> str:
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Username hanya boleh huruf, angka, underscore, dan dash")
        if len(v) < 3:
            raise ValueError("Username minimal 3 karakter")
        return v.lower()

    @field_validator("phone_number", mode="before")
    @classmethod
    def normalize_phone(cls, v: Optional[str]) -> Optional[str]:
        """Terima format lokal Indonesia dan normalkan ke E.164.

        Frontend lama mengirim '081234567890' apa adanya; tanpa normalisasi
        Pydantic menolaknya dengan 422 yang tidak bisa dibaca user. Sekarang
        '08...' / '62...' / '8...' semuanya diterima, termasuk spasi, dash,
        dan tanda kurung.
        """
        if v is None:
            return v
        cleaned = re.sub(r"[^\d+]", "", str(v))
        if not cleaned:
            return cleaned
        # '+0812...' -> '+' + '812...' ; '+' sudah benar dibiarkan apa adanya
        if cleaned.startswith("+"):
            return "+" + cleaned[1:].lstrip("0")
        digits = cleaned.lstrip("0")
        if digits.startswith("62") and len(digits) > 10:
            return "+" + digits
        return "+62" + digits

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            raise ValueError("Nomor telepon wajib diisi")
        if not (v.startswith("+") and len(v) >= 10 and v[1:].isdigit()):
            raise ValueError("Nomor telepon harus dalam format internasional (contoh: +628****5678)")
        return v


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone_number: Optional[str] = None
    avatar_url: Optional[str] = None


class AdminUserCreate(UserCreate):
    """Create-user payload for the admin panel.

    Adds an optional role so a superadmin can create admin accounts directly.
    Kept separate from UserCreate so the public registration endpoint cannot
    smuggle a role in. Nomor telepon opsional di sini: admin kadang membuat
    akun tanpa WhatsApp.
    """

    role: Optional[UserRole] = UserRole.USER


class UserLimitResponse(BaseModel):
    max_conversions_per_day: int
    max_conversions_per_month: int
    max_file_size_mb: int
    max_output_formats: int
    allowed_formats: List[str]
    use_ai_analysis: bool

    class Config:
        from_attributes = True


class UserResponse(UserBase):
    id: uuid.UUID
    role: UserRole
    is_active: bool
    is_verified: bool
    avatar_url: Optional[str]
    created_at: datetime
    last_login: Optional[datetime]

    class Config:
        from_attributes = True


class UserWithLimits(UserResponse):
    """User lengkap dengan limits — untuk endpoint /me."""
    limits: Optional[UserLimitResponse] = None

