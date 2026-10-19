"""Regression: pendaftaran harus menerima format nomor telepon Indonesia.

Bug yang dilaporkan: user mengetik '081234567890' di form register dan
mendapat 422 "permintaan gagal" tanpa penjelasan, karena:

1. PhoneInput tidak menambah kode negara kalau user tidak mengetik '+'.
2. Frontend hanya membaca `detail` sebagai string, sedangkan FastAPI
   mengembalikan array objek -> toast tampil kosong.
"""
import re

import pytest

from app.schemas.user import UserCreate


def _make(phone):
    return UserCreate(
        email="user@example.com",
        username="useroke",
        password="password123",
        phone_number=phone,
    )


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("081234567890", "+6281234567890"),
        ("+6281234567890", "+6281234567890"),
        ("6281234567890", "+6281234567890"),
        ("81234567890", "+6281234567890"),
        ("+62 812-3456-7890", "+6281234567890"),
        ("(0812) 3456 7890", "+6281234567890"),
    ],
)
def test_local_indonesian_formats_are_normalized(raw, expected):
    assert _make(raw).phone_number == expected


@pytest.mark.parametrize("raw", ["0812", "abc", "", "12345"])
def test_too_short_or_empty_phone_is_rejected_with_clear_message(raw):
    with pytest.raises(Exception) as exc:
        _make(raw)
    msgs = [e["msg"] for e in exc.value.errors()]
    assert any("telepon" in m.lower() for m in msgs), msgs


def test_missing_phone_is_rejected_by_register_endpoint():
    """Schema membolehkan None, tapi endpoint /register menolak dengan 422
    beserta pesan yang bisa ditampilkan frontend."""
    import asyncio

    from fastapi import HTTPException

    from app.api.auth import register

    class _BG:
        def add_task(self, *a, **k):
            pass

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            register(
                user_in=UserCreate(
                    email="a@b.com", username="abc", password="password123"
                ),
                background_tasks=_BG(),
                db=None,
            )
        )
    assert exc.value.status_code == 422
    assert "Nomor telepon" in exc.value.detail


def test_validation_handler_returns_string_detail():
    """Handler 422 di main.py harus mengembalikan detail berupa string."""
    from main import app
    from fastapi.exceptions import RequestValidationError
    from starlette.requests import Request

    # Handler didaftarkan lewat decorator; ambil dari exception_handlers.
    assert RequestValidationError in app.exception_handlers

    err = RequestValidationError(
        [{"type": "value_error", "loc": ("body", "phone_number"),
          "msg": "Value error, Nomor telepon wajib diisi", "input": "abc"}]
    )
    import asyncio

    resp = asyncio.run(
        app.exception_handlers[RequestValidationError](
            Request({"type": "http", "method": "POST", "path": "/", "headers": []}), err
        )
    )
    import json

    body = json.loads(resp.body)
    assert isinstance(body["detail"], str)
    assert "Nomor telepon" in body["detail"]
