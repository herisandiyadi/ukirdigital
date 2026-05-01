import uuid
from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime

from app.models.conversion import ConversionStatus, ConversionMethod


class ConversionJobCreate(BaseModel):
    method: ConversionMethod = ConversionMethod.RELIEF
    formats: list[str] = ["stl"]
    settings: Optional[dict[str, Any]] = None


class ConversionJobResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    original_filename: str
    file_size_bytes: Optional[int]
    status: ConversionStatus
    method: ConversionMethod
    settings: Optional[dict[str, Any]]
    ai_analysis: Optional[dict[str, Any]]
    output_files: Optional[dict[str, str]]
    error_message: Optional[str]
    processing_time_seconds: Optional[float]
    created_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


class ConversionJobListResponse(BaseModel):
    total: int
    items: list[ConversionJobResponse]


class AnalyzeResponse(BaseModel):
    filename: str
    analysis: dict[str, Any]


class LimitsStatusResponse(BaseModel):
    used_today: int
    max_per_day: int
    remaining_today: int
    used_this_month: int
    max_per_month: int
    remaining_month: int
    daily_limit_hit: bool
    monthly_limit_hit: bool
    # user limits config
    max_file_size_mb: int
    max_output_formats: int
    allowed_formats: list[str]
    use_ai_analysis: bool

