import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status

from app.models.user import User, UserRole
from app.models.user_limit import UserLimit
from app.schemas.user import UserCreate, UserUpdate
from app.core.security import hash_password, verify_password
from app.core.defaults import DEFAULT_SYSTEM_SETTINGS


class UserService:

    async def get_by_id(self, db: AsyncSession, user_id: uuid.UUID) -> "User | None":
        result = await db.execute(
            select(User).options(selectinload(User.limits)).where(User.id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_by_email(self, db: AsyncSession, email: str) -> "User | None":
        result = await db.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def get_by_username(self, db: AsyncSession, username: str) -> "User | None":
        result = await db.execute(select(User).where(User.username == username))
        return result.scalar_one_or_none()

    async def get_all(self, db: AsyncSession, skip: int = 0, limit: int = 20):
        total_result = await db.execute(select(func.count()).select_from(User))
        total = total_result.scalar_one()
        result = await db.execute(
            select(User).offset(skip).limit(limit).order_by(User.created_at.desc())
        )
        return total, list(result.scalars().all())

    async def create(
        self,
        db: AsyncSession,
        user_in: UserCreate,
        role: UserRole | None = None,
    ) -> User:
        if await self.get_by_email(db, user_in.email):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
        if await self.get_by_username(db, user_in.username):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken")
        user = User(
            email=user_in.email,
            username=user_in.username,
            full_name=user_in.full_name,
            hashed_password=hash_password(user_in.password),
            role=role or UserRole.USER,
            is_verified=False,
        )
        db.add(user)
        await db.flush()
        defaults = DEFAULT_SYSTEM_SETTINGS["default_user_limits"]
        limits = UserLimit(
            user_id=user.id,
            max_conversions_per_day=defaults["max_conversions_per_day"],
            max_conversions_per_month=defaults["max_conversions_per_month"],
            max_file_size_mb=defaults["max_file_size_mb"],
            max_output_formats=defaults["max_output_formats"],
            allowed_formats=defaults["allowed_formats"],
            use_ai_analysis=defaults["use_ai_analysis"],
        )
        db.add(limits)
        await db.commit()
        await db.refresh(user)
        return user

    async def update(self, db: AsyncSession, user: User, user_in: UserUpdate) -> User:
        update_data = user_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(user, field, value)
        await db.commit()
        await db.refresh(user)
        return user

    async def authenticate(self, db: AsyncSession, email: str, password: str) -> User:
        user = await self.get_by_email(db, email)
        if not user or not verify_password(password, user.hashed_password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email atau password salah")
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Akun tidak aktif")
        user.last_login = datetime.now(timezone.utc)
        await db.commit()
        return user

    async def verify_email(self, db: AsyncSession, user_id: uuid.UUID) -> User:
        user = await self.get_by_id(db, user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User tidak ditemukan")
        if user.is_verified:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email sudah diverifikasi")
        user.is_verified = True
        await db.commit()
        await db.refresh(user)
        return user

    async def update_password(self, db: AsyncSession, user: User, new_password: str) -> User:
        user.hashed_password = hash_password(new_password)
        await db.commit()
        return user

    async def deactivate(self, db: AsyncSession, user: User) -> User:
        user.is_active = False
        await db.commit()
        return user


user_service = UserService()
