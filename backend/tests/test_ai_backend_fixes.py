"""B-01 (timeout + tes koneksi AI), B-04 (threshold adaptif), B-02 (MIME download)."""
import asyncio
import importlib
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import numpy as np
import openai
import pytest
from fastapi import HTTPException
from PIL import Image

ai_mod = importlib.import_module("app.services.ai_service")
conv_mod = importlib.import_module("app.api.conversions")
admin_mod = importlib.import_module("app.api.admin")

CFG = {"api_key": "sk-secret", "base_url": "http://x/v1", "model": "m", "max_tokens": 10}


def _req():
    return httpx.Request("POST", "http://x/v1/chat/completions")


def _resp(code):
    return httpx.Response(code, request=_req())


def _photo(path):
    rng = np.random.default_rng(1)
    g = np.clip(rng.normal(110, 40, (200, 200)), 0, 255).astype(np.uint8)
    Image.fromarray(g).convert("RGB").save(path)


def _graphic(path):
    a = np.full((100, 100), 255, np.uint8)
    a[20:80, 20:80] = 0
    Image.fromarray(a).convert("RGB").save(path)


# ── B-04 ─────────────────────────────────────────────────────────────────────

def test_stats_graphic(tmp_path):
    p = tmp_path / "g.png"
    _graphic(p)
    st = ai_mod.compute_luminance_stats(str(p))
    assert st["image_kind"] == "graphic"
    assert 1 <= st["otsu"] <= 254


def test_stats_photo_threshold_is_p40(tmp_path):
    p = tmp_path / "p.png"
    _photo(p)
    st = ai_mod.compute_luminance_stats(str(p))
    assert st["image_kind"] == "photo"
    out = ai_mod.apply_adaptive_threshold({"suggested_threshold": 128}, st)
    assert out["suggested_threshold"] == st["p40"]
    assert out["suggested_threshold"] != 128
    assert out["threshold_source"] == "histogram-p40"
    assert out["llm_suggested_threshold"] == 128


def test_analyze_sync_overrides_llm_threshold(tmp_path):
    p = tmp_path / "p.png"
    _photo(p)
    client = MagicMock()
    client.chat.completions.create.return_value = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(
            content='{"suggested_threshold":128,"image_kind":"photo","recommended_method":"silhouette"}'))]
    )
    with patch.object(ai_mod, "OpenAI", return_value=client) as ctor:
        res = ai_mod.AIService()._analyze_sync(str(p), dict(CFG, timeout_s=15))
    assert ctor.call_args.kwargs["timeout"] == 15
    assert ctor.call_args.kwargs["max_retries"] == 0
    assert res["suggested_threshold"] != 128
    assert res["threshold_source"] == "histogram-p40"
    assert res["recommended_method"] == "heightmap"


def test_parse_error_still_gets_threshold(tmp_path):
    p = tmp_path / "g.png"
    _graphic(p)
    client = MagicMock()
    client.chat.completions.create.return_value = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content="not json"))])
    with patch.object(ai_mod, "OpenAI", return_value=client):
        res = ai_mod.AIService()._analyze_sync(str(p), dict(CFG))
    assert res["parse_error"] is True
    assert res["threshold_source"] == "histogram-otsu"


# ── B-01 ─────────────────────────────────────────────────────────────────────

def _svc_with_sync(side_effect):
    svc = ai_mod.AIService()
    svc._load_ai_config = AsyncMock(return_value=dict(CFG))
    svc._analyze_sync = MagicMock(side_effect=side_effect)
    return svc


def test_analyze_timeout_maps_to_indonesian_error():
    svc = _svc_with_sync(openai.APITimeoutError(request=_req()))
    with pytest.raises(ai_mod.AIAnalysisError) as e:
        asyncio.run(svc.analyze_image("x"))
    assert e.value.timeout is True
    assert "15 detik" in e.value.user_message


def test_analyze_auth_and_model_errors():
    svc = _svc_with_sync(openai.AuthenticationError("x", response=_resp(401), body=None))
    with pytest.raises(ai_mod.AIAnalysisError) as e:
        asyncio.run(svc.analyze_image("x"))
    assert "tidak valid" in e.value.user_message and not e.value.timeout
    svc = _svc_with_sync(openai.NotFoundError("x", response=_resp(404), body=None))
    with pytest.raises(ai_mod.AIAnalysisError) as e:
        asyncio.run(svc.analyze_image("x"))
    assert "Model AI" in e.value.user_message


def test_analyze_endpoint_returns_504_and_502():
    async def run(exc):
        user = SimpleNamespace(limits=SimpleNamespace(use_ai_analysis=True))
        with patch.object(conv_mod, "save_upload_file", AsyncMock(return_value=("/tmp/x", "a.png", 1))), \
             patch.object(conv_mod, "delete_file", lambda p: None), \
             patch.object(conv_mod.ai_service, "analyze_image", AsyncMock(side_effect=exc)):
            await conv_mod.analyze_image(file=MagicMock(), db=None, current_user=user)

    with pytest.raises(HTTPException) as e:
        asyncio.run(run(ai_mod.AIAnalysisError("lambat", timeout=True)))
    assert e.value.status_code == 504 and e.value.detail == "lambat"
    with pytest.raises(HTTPException) as e:
        asyncio.run(run(ai_mod.AIAnalysisError("rusak")))
    assert e.value.status_code == 502


def test_test_connection_auth_error_no_key_leak():
    svc = ai_mod.AIService()
    svc._load_ai_config = AsyncMock(return_value=dict(CFG))
    svc._test_sync = MagicMock(side_effect=openai.AuthenticationError("x", response=_resp(401), body=None))
    res = asyncio.run(svc.test_connection({"api_key": "sk-form-secret", "model": "bad"}))
    assert res["ok"] is False and res["model"] == "bad"
    assert "sk-form-secret" not in repr(res) and "sk-secret" not in repr(res)
    assert svc._test_sync.call_args.args[0]["api_key"] == "sk-form-secret"


def test_test_connection_ok_and_blank_key_ignored():
    svc = ai_mod.AIService()
    svc._load_ai_config = AsyncMock(return_value=dict(CFG))
    svc._test_sync = MagicMock(return_value="OK")
    res = asyncio.run(svc.test_connection({"api_key": "  ", "model": "good"}))
    assert res["ok"] is True and res["reply"] == "OK" and res["latency_ms"] is not None
    assert svc._test_sync.call_args.args[0]["api_key"] == "sk-secret"


def test_admin_test_endpoint_registered_with_require_admin():
    route = next(r for r in admin_mod.router.routes if getattr(r, "path", "") == "/settings/ai/test")
    assert "POST" in route.methods
    deps = [d.call for d in route.dependant.dependencies]
    assert admin_mod.require_admin in deps


def test_admin_test_endpoint_runs():
    db = MagicMock()
    db.commit = AsyncMock()
    admin = SimpleNamespace(id=uuid.uuid4())
    fake = {"ok": False, "error": "API key AI tidak valid"}
    with patch.object(ai_mod.ai_service, "test_connection", AsyncMock(return_value=fake)):
        res = asyncio.run(admin_mod.test_ai_connection(body={"api_key": "k", "x": "y"}, db=db, admin=admin))
    assert res == fake


# ── B-02 ─────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("fmt,mime", [("svg", "image/svg+xml"), ("stl", "model/stl"),
                                      ("dxf", "application/dxf")])
def test_download_media_type(tmp_path, fmt, mime):
    f = tmp_path / f"o.{fmt}"
    f.write_text("data")
    job = SimpleNamespace(id=uuid.uuid4(), original_filename="a.png", output_files={fmt: str(f)})
    request = SimpleNamespace(client=None, headers={})
    with patch.object(conv_mod.conversion_service, "get_by_id", AsyncMock(return_value=job)), \
         patch.object(conv_mod.conversion_service, "log_action", AsyncMock()):
        resp = asyncio.run(conv_mod.download_file(
            job_id=job.id, fmt=fmt, request=request, db=None,
            current_user=SimpleNamespace(id=uuid.uuid4())))
    assert resp.media_type == mime
