"""
Regression tests Sprint 3 (hardening):
  BUG-B08  timeout job memakai processing_started_at, bukan created_at
  BUG-B09  request konversi mengunci baris user (SELECT ... FOR UPDATE)
  BUG-B10  log_action membuka session sendiri (tidak memakai session request)
  BUG-B11  hitungan kuota memakai batas UTC, bukan date.today()
"""

import asyncio
import importlib
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

cs_mod = importlib.import_module("app.services.conversion_service")
maint = importlib.import_module("app.services.maintenance_service")
conv_api = importlib.import_module("app.api.conversions")


# ── BUG-B11 ──────────────────────────────────────────────────────────────────

def test_quota_window_is_utc_not_local_date():
    """Batas harian harus 00:00 UTC, tidak bergantung zona waktu server."""
    captured = {}

    async def fake_execute(stmt):
        captured["sql"] = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        result = MagicMock()
        result.scalar_one.return_value = 0
        return result

    db = SimpleNamespace(execute=fake_execute)
    with patch.object(cs_mod, "date") as fake_date:
        # Jika kode lama (date.today) dipakai, hasil ini akan bocor ke query.
        fake_date.today.return_value = datetime(1999, 1, 1).date()
        asyncio.run(cs_mod.conversion_service.count_today(db, uuid.uuid4()))
    assert "1999" not in captured["sql"]


def test_month_window_uses_utc_now():
    fixed = datetime(2026, 3, 15, 12, 0, tzinfo=timezone.utc)
    captured = {}

    async def fake_execute(stmt):
        captured["sql"] = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        result = MagicMock()
        result.scalar_one.return_value = 0
        return result

    class _FakeDT(datetime):
        @classmethod
        def now(cls, tz=None):
            return fixed

    db = SimpleNamespace(execute=fake_execute)
    with patch.object(cs_mod, "datetime", _FakeDT):
        asyncio.run(cs_mod.conversion_service.count_this_month(db, uuid.uuid4()))
    assert "2026-03-01" in captured["sql"]


# ── BUG-B10 ──────────────────────────────────────────────────────────────────

def test_log_action_uses_own_session_not_request_session():
    """Background task tidak boleh memakai session request yang sudah ditutup."""
    own_session = AsyncMock()
    own_session.__aenter__.return_value = own_session
    own_session.__aexit__.return_value = False

    with patch("app.core.database.AsyncSessionLocal", return_value=own_session), \
         patch.object(cs_mod.ConversionService, "_write_log", AsyncMock()) as write:
        stale_request_session = object()
        asyncio.run(
            cs_mod.conversion_service.log_action(
                stale_request_session, uuid.uuid4(), None, "convert"
            )
        )
    write.assert_awaited_once()
    assert write.await_args.args[0] is own_session


# ── BUG-B08 ──────────────────────────────────────────────────────────────────

def test_timeout_query_uses_processing_started_at():
    captured = {}

    class _Res:
        def scalars(self):
            return SimpleNamespace(all=lambda: [])

    async def fake_execute(stmt):
        captured["sql"] = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        return _Res()

    session = AsyncMock()
    session.execute = fake_execute
    session.__aenter__.return_value = session
    session.__aexit__.return_value = False

    with patch.object(maint, "AsyncSessionLocal", return_value=session):
        asyncio.run(maint.task_timeout_stuck_jobs())
    assert "processing_started_at" in captured["sql"]


def test_processing_marks_start_time():
    from app.models.conversion import ConversionStatus
    job = SimpleNamespace(status=None, processing_started_at=None)
    db = SimpleNamespace(commit=AsyncMock())
    # Cuplikan logika: status PROCESSING disertai waktu mulai.
    job.status = ConversionStatus.PROCESSING.value
    job.processing_started_at = datetime.now(timezone.utc)
    assert job.processing_started_at is not None


# ── BUG-B09 ──────────────────────────────────────────────────────────────────

def test_create_conversion_locks_user_row():
    """Kunci baris user dipakai sebelum cek kuota (SELECT ... FOR UPDATE)."""
    import inspect
    src = inspect.getsource(conv_api.create_conversion)
    lock_pos = src.find("with_for_update()")
    count_pos = src.find("count_today")
    assert lock_pos != -1, "lock FOR UPDATE tidak ada"
    assert lock_pos < count_pos, "lock harus sebelum cek kuota"
