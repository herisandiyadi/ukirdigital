import uuid
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import datetime

from app.models.user import UserRole


# ── Token schemas ────────────────────────────────────────────────────────────

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    sub: Optional[str] = None
    type: Optional[str] = None


# ── Auth user profile (embedded in login response) ───────────────────────────

class AuthUserProfile(BaseModel):
    id: uuid.UUID
    email: str
    username: str
    full_name: Optional[str]
    role: UserRole
    avatar_url: Optional[str]
    is_verified: bool

    class Config:
        from_attributes = True


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: AuthUserProfile


# ── Request bodies ────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password minimal 8 karakter")
        return v


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password minimal 8 karakter")
        return v


# ── Simple message response ───────────────────────────────────────────────────

class MessageResponse(BaseModel):
    message: str

