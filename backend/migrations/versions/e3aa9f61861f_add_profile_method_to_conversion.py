"""add_profile_method_to_conversion

Revision ID: e3aa9f61861f
Revises: add_phone_number_001
Create Date: 2026-04-20 22:18:28.069910

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e3aa9f61861f'
down_revision: Union[str, Sequence[str], None] = 'add_phone_number_001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add 'profile' to the conversionmethod enum
    op.execute("ALTER TYPE conversionmethod ADD VALUE 'profile'")


def downgrade() -> None:
    """Downgrade schema."""
    # Note: PostgreSQL doesn't allow removing enum values, so we leave this empty
    # To fully downgrade, you would need to drop and recreate the enum type
    pass
