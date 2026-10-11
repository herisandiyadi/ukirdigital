import uuid
from sqlalchemy import Column, String, DateTime, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.core.database import Base


class RevokedToken(Base):
    """Token (refresh / reset password) yang sudah dicabut.

    BUG-S05: logout harus benar-benar membatalkan refresh token.
    BUG-S06: token reset password hanya boleh dipakai sekali.

    `jti` adalah id unik token (claim JWT). Baris dibersihkan oleh task
    maintenance setelah `expires_at` lewat.
    """
    __tablename__ = "revoked_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    jti = Column(String(64), nullable=False)
    token_type = Column(String(32), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


Index("ix_revoked_tokens_jti", RevokedToken.jti, unique=True)
Index("ix_revoked_tokens_expires_at", RevokedToken.expires_at)
