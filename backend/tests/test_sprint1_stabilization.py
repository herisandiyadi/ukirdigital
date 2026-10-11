"""
Regression tests untuk Sprint 1 "Stabilkan":
  BUG-B01  konversi berjalan di threadpool (event loop tidak diblokir)
  BUG-B02  kegagalan analisis AI tidak membatalkan konversi
  BUG-B05  notifikasi WS completed / failed dikirim setelah job final
  BUG-F04  kontrak job_completed: output_files = { fmt: download_url }
  BUG-S01  SECRET_KEY tanpa default (diuji lewat Settings langsung)

Tanpa database: session dan converter dipalsukan.
"""

import asyncio
import threading
import time
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.api import websocket as ws_mod
from app.models.conversion import ConversionStatus
import importlib
cs_mod = importlib.import_module("app.services.conversion_service")
from app.services.conversion_service import ConversionService


class FakeDB:
    async def commit(self):
        return None

    async def refresh(self, _obj):
        return None


def make_job(formats_ok=True):
    return SimpleNamespace(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        original_filename="logo.png",
        original_file_path="/tmp/logo.png",
        settings={},
        status=ConversionStatus.PENDING.value,
        output_files={},
        ai_analysis=None,
        error_message=None,
        completed_at=None,
        processing_time_seconds=None,
    )


# ── BUG-B01 ──────────────────────────────────────────────────────────────────

def test_converter_runs_off_event_loop():
    """Converter blocking harus jalan di thread lain, bukan di thread event loop."""
    loop_thread = threading.get_ident()
    seen = {}

    def slow_converter(inp, out, cfg):
        seen["thread"] = threading.get_ident()
        time.sleep(0.2)

    async def scenario():
        job = make_job()
        with patch.object(cs_mod, "settings") as s, \
             patch.object(cs_mod, "convert_png_to_stl", slow_converter):
            s.ANTHROPIC_API_KEY = ""
            s.OUTPUT_DIR = "/tmp/ukir-test-out"
            # heartbeat: event loop harus tetap bisa menjalankan tugas lain
            ticks = 0

            async def heartbeat():
                nonlocal ticks
                for _ in range(5):
                    await asyncio.sleep(0.02)
                    ticks += 1

            hb = asyncio.create_task(heartbeat())
            await ConversionService().process(FakeDB(), job, ["stl"], use_ai=False)
            await hb
            return job, ticks

    job, ticks = asyncio.run(scenario())
    assert job.status == ConversionStatus.COMPLETED.value
    assert seen["thread"] != loop_thread
    assert ticks == 5


# ── BUG-B02 ──────────────────────────────────────────────────────────────────

def test_ai_failure_does_not_fail_conversion():
    async def scenario():
        job = make_job()
        svc = ConversionService()
        with patch.object(cs_mod, "settings") as s, \
             patch.object(cs_mod.ai_service, "analyze_image",
                          AsyncMock(side_effect=RuntimeError("quota habis"))), \
             patch.object(cs_mod, "convert_png_to_svg", lambda i, o, c: None), \
             patch.object(svc, "_notify_outcome", AsyncMock()):
            s.ANTHROPIC_API_KEY = "sk-test"
            s.OUTPUT_DIR = "/tmp/ukir-test-out"
            await svc.process(FakeDB(), job, ["svg"], use_ai=True)
        return job

    job = asyncio.run(scenario())
    assert job.status == ConversionStatus.COMPLETED.value
    assert job.ai_analysis["status"] == "unavailable"
    assert "quota habis" in job.ai_analysis["reason"]


# ── BUG-B05 / BUG-F04 ────────────────────────────────────────────────────────

def test_completed_job_notifies_with_output_files_contract():
    async def scenario():
        job = make_job()
        job.status = ConversionStatus.COMPLETED.value
        job.output_files = {"stl": "/x/a.stl", "svg": "/x/a.svg"}
        sent = AsyncMock()
        with patch.object(ws_mod, "notify_job_completed", sent):
            await ConversionService()._notify_outcome(job)
        return job, sent

    job, sent = asyncio.run(scenario())
    # notify_job_completed dipanggil dari dalam helper dengan import lokal,
    # jadi patch harus pada modul websocket — sudah dilakukan di atas.
    sent.assert_awaited_once()
    args = sent.await_args.args
    assert args[1] == str(job.id)
    assert args[2] == {
        "stl": f"/api/v1/conversions/{job.id}/download/stl",
        "svg": f"/api/v1/conversions/{job.id}/download/svg",
    }


def test_failed_job_notifies_failure():
    async def scenario():
        job = make_job()
        job.status = ConversionStatus.FAILED.value
        job.error_message = "boom"
        failed = AsyncMock()
        with patch.object(ws_mod, "notify_job_failed", failed):
            await ConversionService()._notify_outcome(job)
        return job, failed

    job, failed = asyncio.run(scenario())
    failed.assert_awaited_once_with(str(job.user_id), str(job.id), "boom")


def test_notify_failure_never_breaks_job():
    async def scenario():
        job = make_job()
        job.status = ConversionStatus.COMPLETED.value
        job.output_files = {"stl": "/x/a.stl"}
        with patch.object(ws_mod, "notify_job_completed",
                          AsyncMock(side_effect=RuntimeError("ws down"))):
            await ConversionService()._notify_outcome(job)  # tidak boleh raise

    asyncio.run(scenario())


def test_websocket_event_shape_matches_frontend_contract():
    async def scenario():
        sent = AsyncMock()
        with patch.object(ws_mod.ws_manager, "send", sent):
            await ws_mod.notify_job_completed("u1", "j1", {"stl": "/d/stl"})
        return sent.await_args.args[1]

    payload = asyncio.run(scenario())
    assert payload == {
        "type": "job_completed",
        "job_id": "j1",
        "output_files": {"stl": "/d/stl"},
    }


# ── BUG-S01 ──────────────────────────────────────────────────────────────────

def test_secret_key_has_no_default(monkeypatch):
    from pydantic import ValidationError
    from app.core.config import Settings

    monkeypatch.delenv("SECRET_KEY", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)
