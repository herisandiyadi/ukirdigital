import uuid
import enum
from sqlalchemy import Column, String, Float, ForeignKey, DateTime, Integer, JSON
from sqlalchemy.dialects.postgresql import UUID, ENUM as pgENUM
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class ConversionStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ConversionMethod(str, enum.Enum):
    HEIGHTMAP = "heightmap"
    RELIEF = "relief"
    SILHOUETTE = "silhouette"
    PROFILE = "profile"  # Profile/Pocket carving (depth proportional to grayscale)


class ConversionJob(Base):
    __tablename__ = "conversion_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Input file info
    original_filename = Column(String(255), nullable=False)
    original_file_path = Column(String(500), nullable=False)
    file_size_bytes = Column(Integer, nullable=True)

    # Processing
    status = Column(pgENUM("pending", "processing", "completed", "failed", name="conversionstatus", create_type=False), default="pending", nullable=False, index=True)
    method = Column(pgENUM("heightmap", "relief", "silhouette", "profile", name="conversionmethod", create_type=False), default="relief", nullable=False)

    # JSON config: threshold, max_height, base_thickness, scale, resolution
    settings = Column(JSON, nullable=True, default=dict)

    # AI analysis result from Claude (JSON)
    ai_analysis = Column(JSON, nullable=True)

    # Output: {stl: path, svg: path, dxf: path}
    output_files = Column(JSON, nullable=True, default=dict)

    error_message = Column(String(1000), nullable=True)
    processing_time_seconds = Column(Float, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # BUG-B08: kapan proses benar-benar mulai; timeout dihitung dari sini.
    processing_started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    user = relationship("User", back_populates="conversion_jobs")
    usage_logs = relationship("UsageLog", back_populates="job", cascade="all, delete-orphan")
