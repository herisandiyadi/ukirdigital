"""initial_schema

Revision ID: ff4a0e8c2bc9
Revises:
Create Date: 2026-04-11

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "ff4a0e8c2bc9"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── ENUM types ─────────────────────────────────────────────
    user_role = postgresql.ENUM("admin", "user", name="userrole", create_type=False)
    user_role.create(op.get_bind(), checkfirst=True)

    conv_status = postgresql.ENUM(
        "pending", "processing", "completed", "failed",
        name="conversionstatus", create_type=False,
    )
    conv_status.create(op.get_bind(), checkfirst=True)

    conv_method = postgresql.ENUM(
        "heightmap", "relief", "silhouette",
        name="conversionmethod", create_type=False,
    )
    conv_method.create(op.get_bind(), checkfirst=True)

    # ── users ───────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("username", sa.String(100), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=True),
        sa.Column("role", postgresql.ENUM("admin", "user", name="userrole", create_type=False), nullable=False, server_default="user"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("avatar_url", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.Column("last_login", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_id", "users", ["id"])

    # ── user_limits ─────────────────────────────────────────────
    op.create_table(
        "user_limits",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("max_conversions_per_day", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("max_conversions_per_month", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("max_file_size_mb", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("max_output_formats", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("allowed_formats", postgresql.JSON(), nullable=False),
        sa.Column("use_ai_analysis", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("ix_user_limits_id", "user_limits", ["id"])
    op.create_index("ix_user_limits_user_id", "user_limits", ["user_id"], unique=True)

    # ── conversion_jobs ─────────────────────────────────────────
    op.create_table(
        "conversion_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("original_file_path", sa.String(500), nullable=False),
        sa.Column("file_size_bytes", sa.Integer(), nullable=True),
        sa.Column("status", postgresql.ENUM("pending", "processing", "completed", "failed", name="conversionstatus", create_type=False), nullable=False, server_default="pending"),
        sa.Column("method", postgresql.ENUM("heightmap", "relief", "silhouette", name="conversionmethod", create_type=False), nullable=False, server_default="relief"),
        sa.Column("settings", postgresql.JSON(), nullable=True),
        sa.Column("ai_analysis", postgresql.JSON(), nullable=True),
        sa.Column("output_files", postgresql.JSON(), nullable=True),
        sa.Column("error_message", sa.String(1000), nullable=True),
        sa.Column("processing_time_seconds", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_conversion_jobs_id", "conversion_jobs", ["id"])
    op.create_index("ix_conversion_jobs_user_id", "conversion_jobs", ["user_id"])
    op.create_index("ix_conversion_jobs_status", "conversion_jobs", ["status"])

    # ── usage_logs ──────────────────────────────────────────────
    op.create_table(
        "usage_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("conversion_jobs.id", ondelete="CASCADE"), nullable=True),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_usage_logs_id", "usage_logs", ["id"])
    op.create_index("ix_usage_logs_user_id", "usage_logs", ["user_id"])
    op.create_index("ix_usage_logs_job_id", "usage_logs", ["job_id"])

    # ── system_settings ─────────────────────────────────────────
    op.create_table(
        "system_settings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("key", sa.String(100), nullable=False),
        sa.Column("value", postgresql.JSON(), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("ix_system_settings_key", "system_settings", ["key"], unique=True)


def downgrade() -> None:
    op.drop_table("system_settings")
    op.drop_table("usage_logs")
    op.drop_table("conversion_jobs")
    op.drop_table("user_limits")
    op.drop_table("users")

    op.execute("DROP TYPE IF EXISTS conversionmethod")
    op.execute("DROP TYPE IF EXISTS conversionstatus")
    op.execute("DROP TYPE IF EXISTS userrole")
