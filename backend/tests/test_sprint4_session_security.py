"""
Regression tests Sprint 4 (keamanan sesi):
  BUG-S05  refresh token dicabut saat logout dan saat rotasi
  BUG-S06  token reset password hanya bisa dipakai sekali
  BUG-S04  refresh token dikirim sebagai cookie httpOnly
"""

import asyncio
import importlib
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

sec = importlib.import_module("app.core.security")
auth_mod = importlib.import_module("app.api.auth")
cfg = importlib.import_module("app.core.config")


def test_refresh_and_reset_tokens_carry_jti():
    rt = sec.create_refresh_token({"sub": "u1"})
    rp = sec.create_password_reset_token("u1")
    a = sec.decode_token(rt)
    b = sec.decode_token(rp)
    assert a["jti"] and b["jti"]
    assert a["jti"] != sec.decode_token(sec.create_refresh_token({"sub": "u1"}))["jti"]


def test_is_revoked_false_when_no_row():
    session = AsyncMock()
    res = SimpleNamespace(scalar_one_or_none=lambda: None)
    session.execute = AsyncMock(return_value=res)
    session.__aenter__.return_value = session
    session.__aexit__.return_value = False
    payload = {"jti": "abc"}
    with patch("app.core.database.AsyncSessionLocal", return_value=session):
        assert asyncio.run(sec.is_revoked(payload)) is False


def test_is_revoked_true_when_row_exists():
    session = AsyncMock()
    res = SimpleNamespace(scalar_one_or_none=lambda: uuid.uuid4())
    session.execute = AsyncMock(return_value=res)
    session.__aenter__.return_value = session
    session.__aexit__.return_value = False
    with patch("app.core.database.AsyncSessionLocal", return_value=session):
        assert asyncio.run(sec.is_revoked({"jti": "abc"})) is True


def test_revoke_token_stores_jti_and_expiry():
    session = AsyncMock()
    session.__aenter__.return_value = session
    session.__aexit__.return_value = False
    exp = int((datetime.now(timezone.utc) + timedelta(days=1)).timestamp())
    with patch("app.core.database.AsyncSessionLocal", return_value=session):
        asyncio.run(sec.revoke_token({"jti": "j1", "exp": exp, "type": "refresh"}))
    added = session.add.call_args.args[0]
    assert added.jti == "j1"
    assert added.token_type == "refresh"
    assert added.expires_at.tzinfo is not None


def test_revoke_without_jti_is_noop():
    session = AsyncMock()
    session.__aenter__.return_value = session
    session.__aexit__.return_value = False
    with patch("app.core.database.AsyncSessionLocal", return_value=session):
        asyncio.run(sec.revoke_token({"exp": 1}))
    session.add.assert_not_called()


def test_reset_password_rejects_reused_token():
    payload = SimpleNamespace(token=sec.create_password_reset_token(str(uuid.uuid4())), new_password="password123")
    with patch.object(auth_mod, "is_revoked", AsyncMock(return_value=True)):
        with pytest.raises(HTTPException) as exc:
            asyncio.run(auth_mod.reset_password(payload, db=None))
    assert exc.value.status_code == 400


def test_refresh_rejects_revoked_token():
    rt = sec.create_refresh_token({"sub": str(uuid.uuid4())})
    req = SimpleNamespace(cookies={cfg.settings.REFRESH_COOKIE_NAME: rt})
    with patch.object(auth_mod, "is_revoked", AsyncMock(return_value=True)):
        with pytest.raises(HTTPException) as exc:
            asyncio.run(auth_mod.refresh_token(req, SimpleNamespace(set_cookie=lambda **k: None),
                                               auth_mod.RefreshTokenRequest(), db=None))
    assert exc.value.status_code == 401


def test_refresh_cookie_is_httponly_and_scoped():
    captured = {}
    resp = SimpleNamespace(set_cookie=lambda **k: captured.update(k))
    auth_mod._set_refresh_cookie(resp, "tok")
    assert captured["httponly"] is True
    assert captured["samesite"] == "lax"
    assert captured["path"] == "/api/v1/auth"
    assert captured["key"] == cfg.settings.REFRESH_COOKIE_NAME


def test_refresh_reads_cookie_before_body():
    rt_cookie = sec.create_refresh_token({"sub": str(uuid.uuid4())})
    req = SimpleNamespace(cookies={cfg.settings.REFRESH_COOKIE_NAME: rt_cookie})
    body = auth_mod.RefreshTokenRequest(refresh_token=None)
    assert auth_mod._refresh_from(req, body) == rt_cookie


def test_refresh_falls_back_to_body_for_non_web_clients():
    req = SimpleNamespace(cookies={})
    body = auth_mod.RefreshTokenRequest(refresh_token="from-body")
    assert auth_mod._refresh_from(req, body) == "from-body"


def test_login_response_still_carries_tokens_for_api_clients():
    user = SimpleNamespace(
        id=uuid.uuid4(), email="a@example.com", username="a", full_name=None,
        role="user", avatar_url=None, is_verified=True, is_active=True,
        hashed_password="x",
    )
    resp = SimpleNamespace(set_cookie=lambda **k: None)
    payload = SimpleNamespace(email="a@example.com", password="pw")
    with patch.object(auth_mod.user_service, "authenticate", AsyncMock(return_value=user)):
        out = asyncio.run(auth_mod.login(payload, resp, db=None))
    assert out.access_token and out.refresh_token
