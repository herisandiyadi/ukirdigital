"""add processing_started_at to conversion_jobs

Revision ID: b8f01a2c7d10
Revises: f91eb749c9eb
Create Date: 2026-10-11 09:20:00.000000

BUG-B08: timeout job memakai created_at, sehingga job yang lama mengantre
dengan sah ikut ditandai FAILED. Kolom ini mencatat kapan proses benar-benar
mulai, dan timeout dihitung dari sini.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b8f01a2c7d10'
down_revision: Union[str, Sequence[str], None] = 'f91eb749c9eb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "conversion_jobs",
        sa.Column("processing_started_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("conversion_jobs", "processing_started_at")
