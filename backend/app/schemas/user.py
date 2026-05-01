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

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v and not (v.startswith("+") and len(v) >= 10 and v[1:].isdigit()):
            raise ValueError("Nomor telepon harus dalam format internasional (contoh: +62812345678)")
        return v


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone_number: Optional[str] = None
    avatar_url: Optional[str] = None


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

