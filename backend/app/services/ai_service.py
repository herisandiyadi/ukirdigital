import base64
import asyncio
from copy import deepcopy
from pathlib import Path
from typing import Any

from openai import OpenAI
from PIL import Image
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.defaults import DEFAULT_SYSTEM_SETTINGS
from app.models.system_setting import SystemSetting

AI_DEFAULTS = DEFAULT_SYSTEM_SETTINGS["ai"]

ANALYSIS_PROMPT = """Analyze this PNG image for 3D conversion. Return a JSON object with these fields:
- complexity: "simple" | "medium" | "complex"
- dominant_shapes: list of detected shape names (e.g. ["circle","rectangle"])
- has_text: boolean
- background: "white" | "black" | "transparent" | "colored"
- recommended_method: "heightmap" | "relief" | "silhouette"
- recommended_formats: list from ["stl","svg","dxf"]
- suggested_threshold: integer 0-255
- suggested_max_height_mm: float
- notes: short technical description (max 2 sentences)

Respond with ONLY valid JSON, no markdown, no extra text."""


class AIService:
    def __init__(self):
        # SumoPod AI exposes an OpenAI-compatible API.
        self._env_api_key = settings.ANTHROPIC_API_KEY
        self._env_base_url = settings.AI_BASE_URL
        self.model = AI_DEFAULTS["model"]
        self.max_tokens = AI_DEFAULTS["max_tokens"]
        # Hard upper image size for provider (bytes)
        self.max_image_bytes = 5 * 1024 * 1024  # 5 MB

    async def _load_ai_config(self) -> dict[str, Any]:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(SystemSetting).where(SystemSetting.key == "ai"))
            row = result.scalar_one_or_none()

        cfg = deepcopy(AI_DEFAULTS)
        if row and isinstance(row.value, dict):
            cfg.update(row.value)

        provider = (cfg.get("provider") or "anthropic").lower().strip()
        cfg["provider"] = provider

        api_key = (cfg.get("api_key") or self._env_api_key or "").strip()
        if not api_key:
            raise ValueError("AI API key is not configured. Set it via Admin > Settings > AI.")
        cfg["api_key"] = api_key

        base_url = (cfg.get("base_url") or self._default_base_url(provider)).strip()
        if not base_url:
            raise ValueError("AI base URL is not configured. Set it via Admin > Settings > AI.")
        cfg["base_url"] = base_url.rstrip("/")

        cfg["model"] = cfg.get("model") or self.model
        cfg["max_tokens"] = int(cfg.get("max_tokens") or self.max_tokens)

        return cfg

    def _default_base_url(self, provider: str) -> str:
        if provider == "openai":
            return "https://api.openai.com/v1"
        if provider == "anthropic":
            return self._env_base_url or "https://api.anthropic.com"
        # custom provider fallback to whatever is in env (e.g. proxy)
        return self._env_base_url or ""

    def _prepare_image_for_ai(self, image_path: str) -> tuple[bytes, str]:
        """Load image and downscale/compress so encoded image < provider limit.

        - Resize besar ke max 2048x2048 sambil mempertahankan rasio
        - Simpan ke JPEG dengan kualitas menurun bertahap sampai < 5 MB (atau limit)
        """

        # Deteksi tipe dasar dari ekstensi
        ext = Path(image_path).suffix.lower()
        mime_from_ext = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
        }.get(ext, "image/png")

        img = Image.open(image_path)
        img = img.convert("RGB")  # pastikan kompatibel JPEG

        # Step 1: resize down jika terlalu besar
        max_side = 2048
        w, h = img.size
        if max(w, h) > max_side:
            scale = max_side / float(max(w, h))
            new_size = (int(w * scale), int(h * scale))
            img = img.resize(new_size, Image.LANCZOS)

        # Step 2: simpan ke buffer JPEG dengan kualitas menurun sampai < 5MB
        import io

        quality = 90
        img_bytes = b""
        while quality >= 40:
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=quality, optimize=True)
            data = buf.getvalue()
            if len(data) <= self.max_image_bytes:
                img_bytes = data
                break
            quality -= 10

        # fallback kalau tetap besar: pakai versi kualitas terendah yang kita punya
        if not img_bytes:
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=40, optimize=True)
            img_bytes = buf.getvalue()

        return img_bytes, "image/jpeg"

    def _normalize_analysis(self, data: dict[str, Any]) -> dict[str, Any]:
        """Normalize model output to match our supported conversion methods.

        Some prompts/models may return values like "emboss" or "extrude".
        Our backend supports: heightmap | relief | silhouette | profile.
        """
        method = str(data.get("recommended_method") or "").strip().lower()
        method_map = {
            "heightmap": "heightmap",
            "relief": "relief",
            "emboss": "relief",
            "extrude": "silhouette",
            "silhouette": "silhouette",
            "outline": "silhouette",
            "profile": "profile",
            "pocket": "profile",
        }
        if method:
            data["recommended_method"] = method_map.get(method, method)
        return data

    def _analyze_sync(self, image_path: str, cfg: dict[str, Any]) -> dict[str, Any]:
        """Blocking call — run inside executor for async contexts."""
        import json

        # Downscale + compress khusus untuk analisis AI (bukan untuk STL)
        image_bytes, media_type = self._prepare_image_for_ai(image_path)
        b64 = base64.standard_b64encode(image_bytes).decode("utf-8")

        client = OpenAI(
            api_key=cfg["api_key"],
            base_url=cfg["base_url"],
        )

        resp = client.chat.completions.create(
            model=cfg["model"],
            max_tokens=cfg["max_tokens"],
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": ANALYSIS_PROMPT},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{media_type};base64,{b64}",
                            },
                        },
                    ],
                }
            ],
        )

        raw = (resp.choices[0].message.content or "").strip()

        try:
            return self._normalize_analysis(json.loads(raw))
        except json.JSONDecodeError:
            return {"raw_analysis": raw, "parse_error": True}

    async def analyze_image(self, image_path: str) -> dict[str, Any]:
        loop = asyncio.get_event_loop()
        cfg = await self._load_ai_config()
        return await loop.run_in_executor(None, self._analyze_sync, image_path, cfg)


ai_service = AIService()
