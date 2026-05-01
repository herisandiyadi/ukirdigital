import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class UsageLog(Base):
    __tablename__ = "usage_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    job_id = Column(
        UUID(as_uuid=True),
        ForeignKey("conversion_jobs.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Action: "convert" | "download" | "delete"
    action = Column(String(50), nullable=False)
    ip_address = Column(String(45), nullable=True)   # IPv4 or IPv6
    user_agent = Column(String(512), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="usage_logs")
    job = relationship("ConversionJob", back_populates="usage_logs")
