"""
WebSocket endpoint — real-time job status notifications.
WS /ws/{user_id}?token=<jwt>

Event shapes (JSON):
  { "type": "job_status_update",  "job_id": "...", "status": "processing", "progress": 45 }
  { "type": "job_completed",      "job_id": "...", "output_format": "stl",  "download_url": "..." }
  { "type": "job_failed",         "job_id": "...", "error": "..." }
  { "type": "usage_limit_warning","used": 8, "max": 10, "scope": "daily" }
  { "type": "ping" }  →  { "type": "pong" }
"""
import asyncio
import json
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from fastapi.websockets import WebSocketState

from app.core.security import decode_access_token

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Connection Manager ────────────────────────────────────────────────────────

class ConnectionManager:
    """Thread-safe (single-process) in-memory WebSocket registry."""

    def __init__(self):
        # user_id (str) → list of active WebSocket connections
        self._connections: dict[str, list[WebSocket]] = {}

    async def connect(self, user_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.setdefault(user_id, []).append(ws)
        logger.info("[WS] connected  user=%s  total_conns=%d", user_id, len(self._connections[user_id]))

    def disconnect(self, user_id: str, ws: WebSocket) -> None:
        conns = self._connections.get(user_id, [])
        if ws in conns:
            conns.remove(ws)
        if not conns:
            self._connections.pop(user_id, None)
        logger.info("[WS] disconnected user=%s", user_id)

    async def send(self, user_id: str, payload: dict) -> None:
        """Send a JSON payload to all connections for a user."""
        conns = list(self._connections.get(user_id, []))
        dead: list[WebSocket] = []
        for ws in conns:
            try:
                if ws.client_state == WebSocketState.CONNECTED:
                    await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(user_id, ws)

    async def broadcast(self, payload: dict) -> None:
        """Send a JSON payload to every connected user."""
        for uid in list(self._connections.keys()):
            await self.send(uid, payload)

    def is_connected(self, user_id: str) -> bool:
        return bool(self._connections.get(user_id))

    @property
    def connected_user_ids(self) -> list[str]:
        return list(self._connections.keys())


# Singleton shared across the app
ws_manager = ConnectionManager()


# ── WebSocket route ────────────────────────────────────────────────────────────

@router.websocket("/ws/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: str,
    token: Optional[str] = Query(default=None),
):
    """
    Authenticate via JWT query param, then maintain persistent connection.
    Clients send: { "type": "ping" } → server replies { "type": "pong" }
    """
    # ── Auth ──────────────────────────────────────────────────────────────────
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    payload = decode_access_token(token)
    if not payload:
        await websocket.close(code=4001, reason="Invalid token")
        return

    token_user_id = str(payload.get("sub", ""))
    # Allow admin to subscribe to any user's channel; normal users only their own
    if token_user_id != user_id:
        # lazy import to avoid circular deps
        from app.core.database import AsyncSessionLocal
        from app.models.user import User, UserRole
        from sqlalchemy import select

        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(User).where(User.id == uuid.UUID(token_user_id)))
                caller = result.scalar_one_or_none()
                if not caller or caller.role != UserRole.ADMIN:
                    await websocket.close(code=4003, reason="Forbidden")
                    return
        except Exception:
            await websocket.close(code=4003, reason="Forbidden")
            return

    # ── Connect ───────────────────────────────────────────────────────────────
    await ws_manager.connect(user_id, websocket)

    # Send welcome message
    await websocket.send_json({
        "type": "connected",
        "user_id": user_id,
        "message": "WebSocket connection established",
    })

    # ── Message loop ──────────────────────────────────────────────────────────
    try:
        while True:
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=60.0)
                msg = json.loads(raw)

                if msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})

                # Future: handle "subscribe_job" messages etc.

            except asyncio.TimeoutError:
                # Send server-side ping to keep connection alive
                try:
                    await websocket.send_json({"type": "ping"})
                except Exception:
                    break

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("[WS] error for user=%s: %s", user_id, exc)
    finally:
        ws_manager.disconnect(user_id, websocket)


# ── Helper functions for other services to push events ───────────────────────

async def notify_job_status(user_id: str, job_id: str, status: str, progress: int = 0) -> None:
    await ws_manager.send(user_id, {
        "type": "job_status_update",
        "job_id": job_id,
        "status": status,
        "progress": progress,
    })


async def notify_job_completed(
    user_id: str,
    job_id: str,
    output_format: str,
    download_url: str,
) -> None:
    await ws_manager.send(user_id, {
        "type": "job_completed",
        "job_id": job_id,
        "output_format": output_format,
        "download_url": download_url,
    })


async def notify_job_failed(user_id: str, job_id: str, error: str) -> None:
    await ws_manager.send(user_id, {
        "type": "job_failed",
        "job_id": job_id,
        "error": error,
    })


async def notify_usage_warning(
    user_id: str,
    used: int,
    max_allowed: int,
    scope: str = "daily",
) -> None:
    await ws_manager.send(user_id, {
        "type": "usage_limit_warning",
        "used": used,
        "max": max_allowed,
        "scope": scope,
        "percent": round(used / max_allowed * 100) if max_allowed else 0,
    })
