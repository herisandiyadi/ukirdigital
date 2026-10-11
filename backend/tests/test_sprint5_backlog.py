"""
Regression tests Sprint 5 (backlog):
  BUG-B12  default provider AI konsisten dengan protokol OpenAI-compatible
  BUG-B13  POST /users ganda dihapus dari router users
  BUG-B14  mount duplikat /api/v1/jobs dihapus
  BUG-O05  hash bcrypt dan JWT tetap kompatibel setelah pindah dari passlib/jose
  BUG-O03  Dockerfile backend jalan sebagai user non-root
  BUG-O04  nginx.conf duplikat (nginx/) dihapus; hanya frontend/nginx.conf
  BUG-F02  WebSocket: tidak reconnect setelah unmount
"""

import importlib
import re
import uuid
from pathlib import Path

import pytest

# Tes struktur repo butuh folder di luar backend/. Di container backend
# (backend/ di-mount sebagai /app) folder itu tidak ada, jadi tes di-skip di sana.
ROOT = Path(__file__).resolve().parents[2]
REPO_AVAILABLE = (ROOT / "frontend").exists()
needs_repo = pytest.mark.skipif(not REPO_AVAILABLE, reason="butuh struktur repo penuh (jalankan dari host)")


def test_ai_default_provider_is_openai_compatible():
    defaults = importlib.import_module("app.core.defaults")
    ai = defaults.DEFAULT_SYSTEM_SETTINGS["ai"]
    assert ai["provider"] in ("openai", "custom")
    assert ai["provider"] != "anthropic"


def test_ai_default_base_url_never_points_to_anthropic_for_openai_sdk():
    ai_mod = importlib.import_module("app.services.ai_service")
    svc = ai_mod.AIService()
    assert "anthropic.com" not in svc._default_base_url("custom")


def test_users_router_has_no_duplicate_post():
    users = importlib.import_module("app.api.users")
    posts = [r.path for r in users.router.routes if "POST" in getattr(r, "methods", set())]
    assert "/users" not in posts


def test_jobs_prefix_not_mounted():
    main = importlib.import_module("main")
    paths = {getattr(r, "path", "") for r in main.app.routes}
    assert not any(p.startswith("/api/v1/jobs") for p in paths)
    assert any(p.startswith("/api/v1/conversions") for p in paths)


def test_password_hash_roundtrip_and_legacy_compat():
    sec = importlib.import_module("app.core.security")
    h = sec.hash_password("correct-horse")
    assert h.startswith("$2b$")
    assert sec.verify_password("correct-horse", h)
    assert not sec.verify_password("wrong", h)
    # Hash lama dari passlib (bcrypt $2b$) harus tetap bisa diverifikasi.
    import bcrypt
    legacy = bcrypt.hashpw(b"legacy-pw", bcrypt.gensalt(rounds=12)).decode()
    assert sec.verify_password("legacy-pw", legacy)


def test_verify_password_returns_false_on_garbage_hash():
    sec = importlib.import_module("app.core.security")
    assert sec.verify_password("x", "not-a-hash") is False


def test_jwt_roundtrip_with_pyjwt():
    sec = importlib.import_module("app.core.security")
    tok = sec.create_access_token({"sub": str(uuid.uuid4())})
    payload = sec.decode_access_token(tok)
    assert payload and payload["type"] == "access"
    assert sec.decode_access_token(tok + "x") is None


@needs_repo
def test_no_jose_or_passlib_left():
    for f in (ROOT / "backend" / "app").rglob("*.py"):
        text = f.read_text()
        # Hanya import sungguhan; komentar yang menyebut nama lama boleh.
        code = "\n".join(l for l in text.splitlines() if not l.lstrip().startswith("#"))
        assert not re.search(r"^\s*(from|import)\s+(jose|passlib)\b", code, re.M), f
    req = (ROOT / "backend" / "requirements.txt").read_text().lower()
    assert "python-jose" not in req and "passlib" not in req


@needs_repo
def test_dockerfile_runs_as_non_root():
    df = (ROOT / "backend" / "Dockerfile").read_text()
    assert re.search(r"^USER\s+(?!root)\S+", df, re.M), "USER non-root tidak ditemukan"


@needs_repo
def test_only_one_nginx_conf_remains():
    assert not (ROOT / "nginx" / "nginx.conf").exists()
    assert (ROOT / "frontend" / "nginx.conf").exists()


@needs_repo
def test_tsbuildinfo_not_tracked():
    gi = (ROOT / "frontend" / ".gitignore").read_text()
    assert "*.tsbuildinfo" in gi


def test_get_me_route_declared_before_user_id():
    """GET /users/me harus didaftarkan sebelum GET /{user_id} supaya 'me' tidak jadi UUID."""
    users = importlib.import_module("app.api.users")
    paths = [r.path for r in users.router.routes if "GET" in getattr(r, "methods", set())]
    assert "/me" in paths
    assert paths.index("/me") < paths.index("/{user_id}")


def test_access_token_has_jti_for_denylist():
    sec = importlib.import_module("app.core.security")
    a = sec.decode_token(sec.create_access_token({"sub": str(uuid.uuid4())}))
    b = sec.decode_token(sec.create_access_token({"sub": str(uuid.uuid4())}))
    assert a["jti"] and b["jti"] and a["jti"] != b["jti"]


def test_jti_revoked_helper_no_jti_is_not_revoked():
    import asyncio
    sec = importlib.import_module("app.core.security")
    class _Db:
        async def execute(self, *_a, **_k):
            raise AssertionError("tidak boleh query tanpa jti")
    assert asyncio.run(sec._is_jti_revoked(_Db(), {"sub": "x"})) is False
