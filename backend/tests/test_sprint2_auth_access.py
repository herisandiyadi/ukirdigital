"""
Regression tests Sprint 2 (auth & akses file):
  BUG-S03  /uploads dan /outputs tidak lagi di-mount sebagai static publik
  BUG-B04  forgot-password tidak membedakan akun tanpa nomor HP (anti-enumerasi)
  BUG-B06  login menolak akun yang belum verifikasi
"""

import asyncio
import importlib
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

auth_mod = importlib.import_module("app.api.auth")


def _user(verified=True, phone="+628123456789"):
    return SimpleNamespace(
        id=uuid.uuid4(),
        email="a@example.com",
        username="a",
        full_name=None,
        role="user",
        avatar_url=None,
        is_verified=verified,
        is_active=True,
        phone_number=phone,
        hashed_password="x",
    )


# ── BUG-S03 ──────────────────────────────────────────────────────────────────

def test_no_public_static_mounts():
    main = importlib.import_module("main")
    mounts = {getattr(r, "path", None) for r in main.app.routes}
    assert "/uploads" not in mounts
    assert "/outputs" not in mounts


# ── BUG-B04 ──────────────────────────────────────────────────────────────────

class _FakeBG:
    def __init__(self):
        self.tasks = []

    def add_task(self, fn, *args):
        self.tasks.append((fn, args))


def _forgot(user):
    payload = SimpleNamespace(email="a@example.com")
    bg = _FakeBG()
    with patch.object(auth_mod.user_service, "get_by_email", AsyncMock(return_value=user)):
        resp = asyncio.run(auth_mod.forgot_password(payload, bg, db=None))
    return resp, bg


def test_forgot_password_no_phone_is_not_an_error():
    resp, bg = _forgot(_user(phone=None))
    assert resp.message.startswith("Jika akun terdaftar")
    assert bg.tasks == []


def test_forgot_password_unknown_email_same_response():
    payload = SimpleNamespace(email="nobody@example.com")
    bg = _FakeBG()
    with patch.object(auth_mod.user_service, "get_by_email", AsyncMock(return_value=None)):
        resp = asyncio.run(auth_mod.forgot_password(payload, bg, db=None))
    known, _ = _forgot(_user())
    assert resp.message == known.message


def test_forgot_password_with_phone_queues_whatsapp():
    _, bg = _forgot(_user(phone="+628123456789"))
    assert len(bg.tasks) == 1


# ── BUG-B06 ──────────────────────────────────────────────────────────────────

def _login(user):
    payload = SimpleNamespace(email="a@example.com", password="pw")
    with patch.object(auth_mod.user_service, "authenticate", AsyncMock(return_value=user)):
        return asyncio.run(auth_mod.login(payload, db=None))


def test_login_unverified_user_is_forbidden():
    with pytest.raises(HTTPException) as exc:
        _login(_user(verified=False))
    assert exc.value.status_code == 403


def test_login_verified_user_gets_tokens():
    resp = _login(_user(verified=True))
    assert resp.access_token and resp.refresh_token
