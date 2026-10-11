"""
CLI admin — dijalankan di server, bukan lewat API publik.

Pemakaian (dari folder backend/, atau `docker compose exec backend python -m app.cli ...`):

  python -m app.cli create-superadmin --email you@example.com --username you [--full-name "Nama"]

Password dibaca dari prompt tersembunyi (getpass) atau env SUPERADMIN_PASSWORD.
Tidak pernah menerima password sebagai argumen (tidak masuk shell history).

Perintah ini hanya membuat superadmin baru; tidak mengubah role user yang sudah ada.
Untuk menaikkan user yang sudah ada, gunakan superadmin lain lewat API:
  PUT /api/v1/admin/users/{id}  {"role": "superadmin"}
"""

import argparse
import asyncio
import getpass
import os
import sys
import uuid

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.models.user_limit import UserLimit
from app.core.defaults import DEFAULT_SYSTEM_SETTINGS


async def _create_superadmin(email: str, username: str, full_name: str | None, password: str) -> int:
    async with AsyncSessionLocal() as db:
        exists = await db.execute(select(User.id).where((User.email == email) | (User.username == username)))
        if exists.first():
            print("ERROR: email atau username sudah dipakai.", file=sys.stderr)
            return 1

        user = User(
            id=uuid.uuid4(),
            email=email,
            username=username,
            full_name=full_name,
            hashed_password=hash_password(password),
            role=UserRole.SUPERADMIN,
            is_active=True,
            is_verified=True,
        )
        db.add(user)
        await db.flush()

        defaults = DEFAULT_SYSTEM_SETTINGS["default_user_limits"]
        db.add(UserLimit(
            user_id=user.id,
            max_conversions_per_day=defaults["max_conversions_per_day"],
            max_conversions_per_month=defaults["max_conversions_per_month"],
            max_file_size_mb=defaults["max_file_size_mb"],
            max_output_formats=defaults["max_output_formats"],
            allowed_formats=defaults["allowed_formats"],
            use_ai_analysis=defaults["use_ai_analysis"],
        ))
        await db.commit()
        print(f"OK: superadmin dibuat: {email} (id={user.id})")
        return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)

    cs = sub.add_parser("create-superadmin", help="Buat akun superadmin pertama")
    cs.add_argument("--email", required=True)
    cs.add_argument("--username", required=True)
    cs.add_argument("--full-name", default=None)
    args = parser.parse_args(argv)

    password = os.environ.get("SUPERADMIN_PASSWORD") or getpass.getpass("Password superadmin: ")
    if len(password) < 8:
        print("ERROR: password minimal 8 karakter.", file=sys.stderr)
        return 1
    return asyncio.run(_create_superadmin(args.email, args.username, args.full_name, password))


if __name__ == "__main__":
    raise SystemExit(main())
