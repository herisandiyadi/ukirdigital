#!/usr/bin/env python3
"""
Seed script: creates the initial admin user + default limits.
Run: python seed.py
"""
import asyncio
import uuid
from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.models.user_limit import UserLimit
from sqlalchemy import select


ADMIN_EMAIL    = "admin@example.com"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "Admin1234!"
ADMIN_FULLNAME = "System Administrator"


async def seed() -> None:
    async with AsyncSessionLocal() as db:
        # Check if admin already exists
        result = await db.execute(select(User).where(User.email == ADMIN_EMAIL))
        existing = result.scalar_one_or_none()
        if existing:
            print(f"[seed] Admin user already exists: {ADMIN_EMAIL}")
            return

        admin_id = uuid.uuid4()
        admin = User(
            id=admin_id,
            email=ADMIN_EMAIL,
            username=ADMIN_USERNAME,
            hashed_password=hash_password(ADMIN_PASSWORD),
            full_name=ADMIN_FULLNAME,
            role="admin",
            is_active=True,
            is_verified=True,
        )
        db.add(admin)

        # Give admin generous limits
        limits = UserLimit(
            id=uuid.uuid4(),
            user_id=admin_id,
            max_conversions_per_day=1000,
            max_conversions_per_month=10000,
            max_file_size_mb=100,
            max_output_formats=3,
            allowed_formats=["stl", "svg", "dxf"],
            use_ai_analysis=True,
        )
        db.add(limits)

        await db.commit()
        print(f"[seed] ✅  Admin user created:")
        print(f"         Email   : {ADMIN_EMAIL}")
        print(f"         Password: {ADMIN_PASSWORD}")
        print(f"         Role    : admin")


if __name__ == "__main__":
    asyncio.run(seed())
