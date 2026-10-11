"""
Default system settings dan seed function.
Dijalankan saat pertama kali setup aplikasi.
"""
from typing import Any

DEFAULT_SYSTEM_SETTINGS: dict[str, Any] = {
    "default_user_limits": {
        "max_conversions_per_day": 10,
        "max_conversions_per_month": 100,
        "max_file_size_mb": 10,
        "max_output_formats": 3,
        "allowed_formats": ["stl", "svg", "dxf"],
        "use_ai_analysis": True,
    },
    "conversion_settings": {
        "default_method": "relief",
        "default_threshold": 80,
        "default_max_height_mm": 4.0,
        "default_base_thickness_mm": 2.0,
        "default_scale_mm_per_px": 0.2,
        "default_resolution": 2,
        # Quality defaults (relief smooth/detail)
        "default_smoothing_blur_radius": 1.0,
        # For ornate/shaded images, grayscale relief gives better detail than flat/binary extrude
        "default_relief_detail": "grayscale",  # 'grayscale' or 'binary'
        # Light preprocessing to bring out midtone details
        "default_contrast_stretch": True,
        "default_contrast_low_pct": 2.0,
        "default_contrast_high_pct": 98.0,
        "default_gamma": 1.0,
    },
    "storage": {
        "max_storage_per_user_mb": 500,
        "auto_delete_after_days": 7,
        "allowed_input_types": ["image/png", "image/jpeg", "image/webp"],
        "max_upload_file_mb": 10,  # hard upload limit; can be raised via Admin
    },
    "ai": {
        "enabled": True,
        "model": "claude-sonnet-4-6",
        "max_tokens": 1000,
        "analyze_before_convert": True,
        # BUG-B12: kode memakai SDK OpenAI (protokol chat.completions) ke endpoint
        # OpenAI-compatible. Default provider harus sesuai protokol itu, bukan
        # "anthropic" dengan base_url Anthropic (protokol berbeda).
        "provider": "custom",  # openai | custom (OpenAI-compatible)
        "api_key": "",
        "base_url": "",  # kosong = pakai AI_BASE_URL dari env
    },
}

SETTING_DESCRIPTIONS: dict[str, str] = {
    "default_user_limits": "Default limits applied to every new user account",
    "conversion_settings": "Default parameters used during 3D conversion processing",
    "storage": "File storage limits and cleanup policy",
    "ai": "OpenAI-compatible API configuration for image analysis",
}


async def seed_system_settings(db) -> None:
    """
    Insert default system_settings rows if they don't already exist.
    Dipanggil saat aplikasi startup (lifespan) atau via CLI.
    """
    from sqlalchemy import select
    from app.models.system_setting import SystemSetting

    for key, value in DEFAULT_SYSTEM_SETTINGS.items():
        result = await db.execute(
            select(SystemSetting).where(SystemSetting.key == key)
        )
        existing = result.scalar_one_or_none()

        if existing is None:
            db.add(
                SystemSetting(
                    key=key,
                    value=value,
                    description=SETTING_DESCRIPTIONS.get(key, ""),
                )
            )

    await db.commit()
    print("[seed] system_settings seeded successfully.")
