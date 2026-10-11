"""add superadmin value to userrole enum (FEAT-SA01)

Revision ID: d4e5f6a7b8c9
Revises: c1d2e3f4a5b6
Create Date: 2026-10-11 15:00:00.000000
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE tidak boleh di dalam transaksi pada Postgres < 12;
    # aman di Postgres 16 (image compose). IF NOT EXISTS membuat ulang idempoten.
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'superadmin'")


def downgrade() -> None:
    # Postgres tidak mendukung menghapus nilai enum. Turunkan role superadmin
    # ke admin secara manual sebelum menghapus migrasi ini bila diperlukan.
    pass
