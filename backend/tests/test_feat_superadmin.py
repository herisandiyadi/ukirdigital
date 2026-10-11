"""
FEAT-SA01 — role superadmin & aturan hierarki admin.
"""
import asyncio
import importlib
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.user import UserRole

admin_mod = importlib.import_module("app.api.admin")
sec = importlib.import_module("app.core.security")


def _u(role, uid=None):
    return SimpleNamespace(id=uid or uuid.uuid4(), role=role)


def test_superadmin_role_exists():
    assert UserRole.SUPERADMIN.value == "superadmin"


def test_require_admin_accepts_superadmin():
    u = _u(UserRole.SUPERADMIN)
    assert asyncio.run(sec.require_admin(current_user=u)) is u


def test_require_admin_accepts_admin():
    u = _u(UserRole.ADMIN)
    assert asyncio.run(sec.require_admin(current_user=u)) is u


def test_require_admin_rejects_user():
    with pytest.raises(HTTPException) as e:
        asyncio.run(sec.require_admin(current_user=_u(UserRole.USER)))
    assert e.value.status_code == 403


def test_require_superadmin_rejects_admin():
    with pytest.raises(HTTPException) as e:
        asyncio.run(sec.require_superadmin(current_user=_u(UserRole.ADMIN)))
    assert e.value.status_code == 403


def test_require_superadmin_accepts_superadmin():
    u = _u(UserRole.SUPERADMIN)
    assert asyncio.run(sec.require_superadmin(current_user=u)) is u


def test_admin_cannot_touch_admin():
    actor, target = _u("admin"), _u("admin")
    with pytest.raises(HTTPException) as e:
        admin_mod._guard_target(actor, target)
    assert e.value.status_code == 403


def test_admin_cannot_touch_superadmin():
    with pytest.raises(HTTPException):
        admin_mod._guard_target(_u("admin"), _u("superadmin"))


def test_superadmin_can_touch_admin():
    admin_mod._guard_target(_u("superadmin"), _u("admin"))  # tidak raise


def test_superadmin_cannot_touch_other_superadmin():
    with pytest.raises(HTTPException) as e:
        admin_mod._guard_target(_u("superadmin"), _u("superadmin"))
    assert e.value.status_code == 403


def test_superadmin_can_touch_self_guard_passes():
    me = uuid.uuid4()
    admin_mod._guard_target(_u("superadmin", me), _u("superadmin", me))  # aksi ke diri sendiri diatur endpoint


def test_user_target_is_free_for_admin():
    admin_mod._guard_target(_u("admin"), _u("user"))  # tidak raise


def test_settings_endpoints_are_superadmin_only():
    import inspect
    for fn in (admin_mod.update_defaults, admin_mod.update_presets):
        src = inspect.getsource(fn)
        assert "require_superadmin" in src, fn.__name__


def test_local_admin_guard_removed():
    import inspect
    src = inspect.getsource(admin_mod)
    assert 'role_val != "admin"' not in src


def test_cli_module_importable():
    cli = importlib.import_module("app.cli")
    assert callable(cli.main)


def test_user_role_column_enum_includes_superadmin():
    """Kolom role harus memuat 'superadmin' di definisi tipe DB, kalau tidak
    SQLAlchemy gagal memetakan baris superadmin (KeyError: 'superadmin')."""
    from app.models.user import User
    col = User.__table__.c.role
    values = list(col.type.enums)
    assert "superadmin" in values, values
    assert set(values) >= {"superadmin", "admin", "user"}
