import uuid

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    create_email_verify_token,
    create_password_reset_token,
    decode_token,
    get_current_user,
    verify_password,
)
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    RefreshTokenRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    ChangePasswordRequest,
    MessageResponse,
    AuthUserProfile,
)
from app.schemas.user import UserCreate, UserResponse, UserWithLimits
from app.services.user_service import user_service
from app.services.email_service import send_verification_email, send_reset_password_email
from app.services.whatsapp_service import send_verification_whatsapp, send_reset_password_whatsapp

router = APIRouter()


# ── POST /register ───────────────────────────────────────────────────────────

@router.post(
    "/register",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Daftar akun baru",
)
async def register(
    user_in: UserCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Register user baru:
    - Validasi email & username unik
    - Password minimal 8 karakter
    - Nomor telepon wajib untuk verifikasi WhatsApp
    - Buat user_limits dengan nilai default
    - Kirim kode verifikasi via WhatsApp (background task)
    """
    if not user_in.phone_number:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nomor telepon wajib untuk pendaftaran"
        )
    
    user = await user_service.create(db, user_in)
    token = create_email_verify_token(str(user.id))
    
    # Kirim verifikasi via WhatsApp
    background_tasks.add_task(
        send_verification_whatsapp, user.phone_number, user.username, token
    )
    return MessageResponse(message="Registrasi berhasil! Cek WhatsApp Anda untuk verifikasi akun.")


# ── POST /login ──────────────────────────────────────────────────────────────

@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Login dan dapatkan JWT token",
)
async def login(
    payload: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Login user:
    - Validasi email & password
    - Update last_login
    - Return access_token (15 menit) + refresh_token (7 hari) + profil user
    """
    user = await user_service.authenticate(db, payload.email, payload.password)
    token_data = {"sub": str(user.id)}
    return LoginResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
        user=AuthUserProfile.model_validate(user),
    )


# ── POST /refresh ────────────────────────────────────────────────────────────

@router.post(
    "/refresh",
    response_model=LoginResponse,
    summary="Refresh access token",
)
async def refresh_token(
    payload: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Tukar refresh_token yang masih valid dengan access_token baru.
    Refresh token juga di-rotate (diperbarui).
    """
    token_payload = decode_token(payload.refresh_token)
    if token_payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token bukan refresh token",
        )

    user_id_str = token_payload.get("sub")
    if not user_id_str:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token tidak valid")

    user = await user_service.get_by_id(db, uuid.UUID(user_id_str))
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User tidak ditemukan")

    token_data = {"sub": str(user.id)}
    return LoginResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
        user=AuthUserProfile.model_validate(user),
    )


# ── POST /logout ─────────────────────────────────────────────────────────────

@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Logout",
)
async def logout(current_user=Depends(get_current_user)):
    """
    Logout user. Client harus hapus token dari storage.
    (Untuk invalidasi server-side, implementasikan token blacklist dengan Redis.)
    """
    return MessageResponse(message="Logout berhasil.")


# ── GET /me ──────────────────────────────────────────────────────────────────

@router.get(
    "/me",
    response_model=UserWithLimits,
    summary="Profil user yang sedang login",
)
async def get_me(current_user=Depends(get_current_user)):
    """Return data user lengkap beserta limits."""
    return current_user


# ── POST /verify-email ───────────────────────────────────────────────────────

@router.post(
    "/verify-email",
    response_model=MessageResponse,
    summary="Verifikasi email via token",
)
async def verify_email(
    token: str = Query(..., description="Token verifikasi dari email"),
    db: AsyncSession = Depends(get_db),
):
    """
    Aktifkan akun user setelah klik link verifikasi dari email.
    Token berlaku 24 jam.
    """
    payload = decode_token(token)
    if payload.get("type") != "email_verify":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token verifikasi tidak valid",
        )

    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token tidak valid")

    await user_service.verify_email(db, uuid.UUID(user_id_str))
    return MessageResponse(message="Email berhasil diverifikasi! Akun Anda sudah aktif.")


# ── POST /forgot-password ─────────────────────────────────────────────────────

@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    summary="Request link reset password",
)
async def forgot_password(
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Kirim link reset password ke email (berlaku 1 jam).
    Selalu return 200 meski email tidak terdaftar (security: prevent email enumeration).
    """
    user = await user_service.get_by_email(db, payload.email)
    if user and user.is_active:
        token = create_password_reset_token(str(user.id))
        # Kirim reset password via WhatsApp
        if user.phone_number:
            background_tasks.add_task(
                send_reset_password_whatsapp, user.phone_number, user.username, token
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nomor telepon tidak terdaftar untuk akun ini"
            )
    return MessageResponse(
        message="Jika akun terdaftar, link reset password telah dikirim ke WhatsApp Anda."
    )


# ── POST /reset-password ──────────────────────────────────────────────────────

@router.post(
    "/reset-password",
    response_model=MessageResponse,
    summary="Reset password dengan token",
)
async def reset_password(
    payload: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Reset password menggunakan token dari email.
    Token berlaku 1 jam.
    """
    token_payload = decode_token(payload.token)
    if token_payload.get("type") != "password_reset":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token reset password tidak valid",
        )

    user_id_str = token_payload.get("sub")
    if not user_id_str:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token tidak valid")

    user = await user_service.get_by_id(db, uuid.UUID(user_id_str))
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User tidak ditemukan")

    await user_service.update_password(db, user, payload.new_password)
    return MessageResponse(message="Password berhasil direset. Silakan login.")


# ── POST /change-password ─────────────────────────────────────────────────────

@router.post(
    "/change-password",
    response_model=MessageResponse,
    summary="Ganti password (sudah login)",
)
async def change_password(
    payload: ChangePasswordRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Ganti password untuk user yang sudah login. Butuh password lama."""
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password saat ini salah",
        )
    await user_service.update_password(db, current_user, payload.new_password)
    return MessageResponse(message="Password berhasil diubah.")
