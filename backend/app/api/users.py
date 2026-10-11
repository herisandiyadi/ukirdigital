import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import require_admin, get_current_user
from app.models.user import User
from app.schemas.user import UserResponse, UserUpdate, UserWithLimits
from app.schemas.auth import MessageResponse
from app.services.user_service import user_service

router = APIRouter()


# BUG-B13: POST /users dihapus — duplikat dari POST /admin/users (yang dipakai
# UI admin). Router ini dimount di prefix /api/v1/users, sehingga path lamanya
# sebenarnya /api/v1/users/users.

@router.get("/me", response_model=UserWithLimits, summary="Profil sendiri (beserta limits)")
async def get_me(current_user: User = Depends(get_current_user)):
    """Dipakai SettingsPage. Didefinisikan sebelum /{user_id} agar 'me' tidak diparse sebagai UUID."""
    return current_user


@router.patch("/me", response_model=UserResponse, summary="Update profil sendiri")
async def update_me(
    update_data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update profil user yang sedang login (full_name, email, avatar_url)."""
    return await user_service.update(db, current_user, update_data)


@router.get(
    "",
    response_model=list[UserResponse],
    summary="[Admin] List semua user",
    dependencies=[Depends(require_admin)],
)
async def list_users(
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
):
    """Admin only — list semua user dengan pagination."""
    _, users = await user_service.get_all(db, skip=skip, limit=limit)
    return users


@router.get(
    "/{user_id}",
    response_model=UserWithLimits,
    summary="[Admin] Detail user by ID",
    dependencies=[Depends(require_admin)],
)
async def get_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Admin only — ambil data user beserta limits."""
    user = await user_service.get_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User tidak ditemukan")
    return user

@router.delete(
    "/{user_id}",
    response_model=MessageResponse,
    summary="[Admin] Deaktifkan user",
    dependencies=[Depends(require_admin)],
)
async def deactivate_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """Admin only — non-aktifkan user (soft delete)."""
    if user_id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tidak bisa menonaktifkan akun sendiri",
        )
    user = await user_service.get_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User tidak ditemukan")
    await user_service.deactivate(db, user)
    return MessageResponse(message=f"User '{user.username}' berhasil dinonaktifkan.")

