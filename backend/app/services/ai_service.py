import base64
import asyncio
import io
import json
import time
from copy import deepcopy
from pathlib import Path
from typing import Any

import numpy as np
import openai
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
- image_kind: "photo" | "graphic" (graphic = two-tone logo / line art / flat shapes)
- suggested_threshold: null (computed by the server from the histogram, do not guess)
- suggested_max_height_mm: float
- notes: short technical description (max 2 sentences)

Respond with ONLY valid JSON, no markdown, no extra text."""

AI_TIMEOUT_S = 15.0
TEST_TIMEOUT_S = 10.0


class AIAnalysisError(Exception):
    """Kesalahan analisis AI dengan pesan yang aman ditampilkan ke user."""

    def __init__(self, user_message: str, *, timeout: bool = False):
        super().__init__(user_message)
        self.user_message = user_message
        self.timeout = timeout


def _otsu(hist: np.ndarray) -> int:
    """Threshold Otsu dari histogram 256 bin."""
    hist = hist.astype(np.float64)
    total = hist.sum()
    if total == 0:
        return 128
    levels = np.arange(256, dtype=np.float64)
    w0 = np.cumsum(hist)
    w1 = total - w0
    m = np.cumsum(hist * levels)
    mt = m[-1]
    with np.errstate(divide="ignore", invalid="ignore"):
        between = (mt * w0 - m * total) ** 2 / (w0 * w1)
    between = np.nan_to_num(between, nan=0.0, posinf=0.0, neginf=0.0)
    # Pada histogram dua-puncak murni, banyak threshold bernilai sama: ambil tengah plateau.
    best = np.flatnonzero(between >= between.max() - 1e-9 * max(between.max(), 1.0))
    return int(round(float(best.mean())))


def compute_luminance_stats(image_path: str) -> dict[str, Any]:
    """Ukur distribusi luminansi gambar (server-side, tanpa LLM)."""
    img = Image.open(image_path)
    if img.mode in ("RGBA", "LA", "P"):
        rgba = img.convert("RGBA")
        bg = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        img = Image.alpha_composite(bg, rgba)
    img = img.convert("L")
    img.thumbnail((512, 512))
    g = np.asarray(img, dtype=np.uint8)
    hist = np.bincount(g.ravel(), minlength=256)

    def p(q: float) -> int:
        return int(np.percentile(g, q))

    extremes = float(((g < 40) | (g > 215)).mean())
    uniq = int(len(np.unique(g)))
    is_graphic = extremes > 0.80 or uniq < 32
    return {
        "p10": p(10),
        "p35": p(35),
        "p40": p(40),
        "p45": p(45),
        "p90": p(90),
        "mean": round(float(g.mean()), 2),
        "std": round(float(g.std()), 2),
        "otsu": _otsu(hist),
        "extreme_ratio": round(extremes, 3),
        "unique_levels": uniq,
        "image_kind": "graphic" if is_graphic else "photo",
    }


def apply_adaptive_threshold(data: dict[str, Any], stats: dict[str, Any] | None) -> dict[str, Any]:
    """Override threshold dari LLM dengan nilai berbasis histogram."""
    if not stats:
        return data
    llm_kind = str(data.get("image_kind") or "").strip().lower()
    kind = llm_kind if llm_kind in ("photo", "graphic") else stats["image_kind"]
    if kind == "graphic":
        thr, source = stats["otsu"], "histogram-otsu"
    else:
        thr, source = stats["p40"], "histogram-p40"
    thr = max(10, min(245, int(thr)))
    data["llm_suggested_threshold"] = data.get("suggested_threshold")
    data["suggested_threshold"] = thr
    data["threshold_source"] = source
    data["image_kind"] = kind
    data["luminance_stats"] = stats
    if kind == "photo" and data.get("recommended_method") == "silhouette":
        data["recommended_method"] = "heightmap"
    return data


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

        provider = (cfg.get("provider") or "custom").lower().strip()
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
        # custom provider fallback to whatever is in env (e.g. proxy)
        return self._env_base_url or ""

    def _prepare_image_for_ai(self, image_path: str) -> tuple[bytes, str]:
        """Load image and downscale/compress so encoded image < provider limit.

        - Resize besar ke max 1024x1024 sambil mempertahankan rasio
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
        max_side = 1024
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

    @staticmethod
    def _timeout_of(cfg: dict[str, Any]) -> float:
        try:
            t = float(cfg.get("timeout_s") or AI_TIMEOUT_S)
        except (TypeError, ValueError):
            t = AI_TIMEOUT_S
        return t if t > 0 else AI_TIMEOUT_S

    @staticmethod
    def _map_error(exc: Exception, cfg: dict[str, Any], timeout_s: float) -> AIAnalysisError:
        model = cfg.get("model")
        if isinstance(exc, (openai.APITimeoutError, asyncio.TimeoutError, TimeoutError)):
            return AIAnalysisError(
                f"Analisis AI melebihi {int(timeout_s)} detik. Lanjutkan pengaturan manual.",
                timeout=True,
            )
        if isinstance(exc, openai.AuthenticationError):
            return AIAnalysisError("API key AI tidak valid")
        if isinstance(exc, (openai.NotFoundError, openai.BadRequestError)):
            return AIAnalysisError(f"Model AI tidak dikenali/tidak mendukung gambar: {model}")
        if isinstance(exc, openai.APIConnectionError):
            return AIAnalysisError("Server AI tidak bisa dihubungi")
        if isinstance(exc, openai.RateLimitError):
            return AIAnalysisError("Kuota/rate limit AI terlampaui")
        return AIAnalysisError(f"Analisis AI gagal: {type(exc).__name__}")

    def _analyze_sync(self, image_path: str, cfg: dict[str, Any]) -> dict[str, Any]:
        """Blocking call — run inside executor for async contexts."""
        timeout_s = self._timeout_of(cfg)

        # Statistik luminansi dihitung server (LLM tidak bisa mengukur histogram)
        try:
            stats = compute_luminance_stats(image_path)
        except Exception:
            stats = None

        # Downscale + compress khusus untuk analisis AI (bukan untuk STL)
        image_bytes, media_type = self._prepare_image_for_ai(image_path)
        b64 = base64.standard_b64encode(image_bytes).decode("utf-8")

        prompt = ANALYSIS_PROMPT
        if stats:
            prompt += (
                f"\n\nLuminance stats (server-measured): {json.dumps(stats)}. "
                "Classify image_kind as photo|graphic (two-tone logo/line art). "
                "Do not invent a threshold; leave suggested_threshold null."
            )

        client = OpenAI(
            api_key=cfg["api_key"],
            base_url=cfg["base_url"],
            timeout=timeout_s,
            max_retries=0,
        )

        resp = client.chat.completions.create(
            model=cfg["model"],
            max_tokens=cfg["max_tokens"],
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
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
            data = self._normalize_analysis(json.loads(raw))
            if not isinstance(data, dict):
                raise json.JSONDecodeError("not an object", raw, 0)
        except json.JSONDecodeError:
            data = {"raw_analysis": raw, "parse_error": True}
        return apply_adaptive_threshold(data, stats)

    async def analyze_image(self, image_path: str) -> dict[str, Any]:
        loop = asyncio.get_running_loop()
        cfg = await self._load_ai_config()
        timeout_s = self._timeout_of(cfg)
        cfg["timeout_s"] = timeout_s
        try:
            return await asyncio.wait_for(
                loop.run_in_executor(None, self._analyze_sync, image_path, cfg),
                timeout=timeout_s + 2,
            )
        except AIAnalysisError:
            raise
        except Exception as exc:
            raise self._map_error(exc, cfg, timeout_s) from exc

    async def should_analyze_on_convert(self) -> bool:
        """Baca flag dari DB settings 'ai' (bukan env), plus API key tersedia."""
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(SystemSetting).where(SystemSetting.key == "ai"))
            row = result.scalar_one_or_none()
        cfg = deepcopy(AI_DEFAULTS)
        if row and isinstance(row.value, dict):
            cfg.update(row.value)
        if not cfg.get("enabled") or not cfg.get("analyze_before_convert"):
            return False
        return bool((cfg.get("api_key") or self._env_api_key or "").strip())

    @staticmethod
    def _tiny_png_data_url() -> str:
        buf = io.BytesIO()
        Image.new("RGB", (8, 8), (200, 60, 60)).save(buf, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

    def _test_sync(self, cfg: dict[str, Any], with_image: bool) -> str:
        client = OpenAI(
            api_key=cfg["api_key"],
            base_url=cfg["base_url"],
            timeout=TEST_TIMEOUT_S,
            max_retries=0,
        )
        content: list[dict[str, Any]] = [{"type": "text", "text": "Reply with OK"}]
        if with_image:
            content.append({"type": "image_url", "image_url": {"url": self._tiny_png_data_url()}})
        resp = client.chat.completions.create(
            model=cfg["model"],
            max_tokens=5,
            messages=[{"role": "user", "content": content}],
        )
        return (resp.choices[0].message.content or "").strip()

    async def test_connection(
        self, override: dict[str, Any] | None = None, with_image: bool = True
    ) -> dict[str, Any]:
        """Tes konfigurasi AI (opsional dengan nilai form yang belum disimpan)."""
        result: dict[str, Any] = {
            "ok": False, "model": None, "base_url": None,
            "latency_ms": None, "reply": None, "error": None,
        }
        try:
            cfg = None
            try:
                cfg = await self._load_ai_config()
            except ValueError:
                cfg = None
            if cfg is None:
                cfg = deepcopy(AI_DEFAULTS)
            for k in ("provider", "base_url", "model"):
                v = (override or {}).get(k)
                if isinstance(v, str) and v.strip():
                    cfg[k] = v.strip()
            key = ((override or {}).get("api_key") or "").strip()
            if key:
                cfg["api_key"] = key
            provider = (cfg.get("provider") or "custom").lower()
            if not (override or {}).get("base_url") and not cfg.get("base_url"):
                cfg["base_url"] = self._default_base_url(provider)
            cfg["base_url"] = (cfg.get("base_url") or "").rstrip("/")
            cfg["model"] = cfg.get("model") or self.model
            result["model"] = cfg["model"]
            result["base_url"] = cfg["base_url"]
            if not cfg.get("api_key"):
                result["error"] = "API key AI belum diisi"
                return result
            if not cfg["base_url"]:
                result["error"] = "Base URL AI belum diisi"
                return result

            loop = asyncio.get_running_loop()
            t0 = time.monotonic()
            try:
                reply = await asyncio.wait_for(
                    loop.run_in_executor(None, self._test_sync, cfg, with_image),
                    timeout=TEST_TIMEOUT_S + 2,
                )
            except Exception as exc:
                err = self._map_error(exc, cfg, TEST_TIMEOUT_S)
                result["error"] = err.user_message
                result["latency_ms"] = int((time.monotonic() - t0) * 1000)
                return result
            result["latency_ms"] = int((time.monotonic() - t0) * 1000)
            result["reply"] = reply[:50]
            result["ok"] = True
            return result
        except Exception as exc:  # jangan pernah bocorkan detail/secret
            result["error"] = f"Tes koneksi gagal: {type(exc).__name__}"
            return result


ai_service = AIService()
