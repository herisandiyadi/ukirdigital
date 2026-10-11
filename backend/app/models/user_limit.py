import uuid
from sqlalchemy import Column, Integer, Boolean, DateTime, ForeignKey, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class UserLimit(Base):
    __tablename__ = "user_limits"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )

    max_conversions_per_day = Column(Integer, default=10, nullable=False)
    max_conversions_per_month = Column(Integer, default=100, nullable=False)
    max_file_size_mb = Column(Integer, default=30, nullable=False)
    max_output_formats = Column(Integer, default=3, nullable=False)
    # e.g. ["stl", "svg", "dxf"]
    allowed_formats = Column(JSON, default=lambda: ["stl", "svg", "dxf"], nullable=False)
    use_ai_analysis = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationship
    user = relationship("User", back_populates="limits")
