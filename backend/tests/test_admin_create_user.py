"""Regression: POST /admin/users must not 500 (AttributeError on user.role)."""
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.api import admin as admin_api
from app.models.user import UserRole
from app.schemas.user import AdminUserCreate, UserCreate


def _payload(**extra):
    base = dict(email="new@example.com", username="newuser", password="secret123", full_name="New")
    base.update(extra)
    return AdminUserCreate(**base)


def _actor(role):
    return SimpleNamespace(id=uuid.uuid4(), role=role)


def test_user_create_has_no_role_field():
    # Public registration schema must not accept a role.
    assert "role" not in UserCreate.model_fields


def test_admin_schema_defaults_to_user_role():
    assert _payload().role == UserRole.USER


@pytest.mark.asyncio
async def test_superadmin_creates_admin_passes_role_through():
    fake_user = SimpleNamespace(id=uuid.uuid4(), email="new@example.com")
    with patch.object(admin_api.user_service, "create", AsyncMock(return_value=fake_user)) as create:
        out = await admin_api.create_user_admin(
            user=_payload(role=UserRole.ADMIN), db=None, admin=_actor(UserRole.SUPERADMIN)
        )
    assert out is fake_user
    assert create.await_args.kwargs["role"] == UserRole.ADMIN


@pytest.mark.asyncio
async def test_plain_user_creation_works_without_role():
    fake_user = SimpleNamespace(id=uuid.uuid4(), email="new@example.com")
    with patch.object(admin_api.user_service, "create", AsyncMock(return_value=fake_user)) as create:
        await admin_api.create_user_admin(user=_payload(), db=None, admin=_actor(UserRole.ADMIN))
    assert create.await_args.kwargs["role"] == UserRole.USER


@pytest.mark.asyncio
async def test_admin_cannot_create_admin_account():
    with pytest.raises(HTTPException) as exc:
        await admin_api.create_user_admin(
            user=_payload(role=UserRole.ADMIN), db=None, admin=_actor(UserRole.ADMIN)
        )
    assert exc.value.status_code == 403
