from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.core.database import engine, Base, AsyncSessionLocal
from app.core.defaults import seed_system_settings
from app.api import auth, users, conversions, files
from app.api import admin as admin_api
from app.api import websocket as ws_api
from app.services.maintenance_service import scheduler

# Import all models so Base.metadata is fully populated
import app.models  # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Skema dikelola Alembic (BUG-B07): migrasi dijalankan sebelum uvicorn
    # start (lihat Dockerfile / `make migrate`). create_all dihapus karena
    # tidak membuat tipe enum dan bisa menyimpang dari migrasi.
    # Seed default system settings
    async with AsyncSessionLocal() as db:
        await seed_system_settings(db)
    # Start background scheduler
    scheduler.start()
    yield
    # Shutdown
    scheduler.shutdown(wait=False)
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="PNG to 3D format converter (STL, SVG, DXF) with AI analysis",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# File hasil & upload TIDAK di-mount sebagai static (BUG-S03).
# Akses hanya lewat endpoint ber-auth: /api/v1/conversions/{id}/download/{fmt}.

# Routers
app.include_router(auth.router,        prefix="/api/v1/auth",        tags=["Auth"])
app.include_router(users.router,       prefix="/api/v1/users",       tags=["Users"])
app.include_router(conversions.router, prefix="/api/v1/conversions", tags=["Conversions v1"])
app.include_router(conversions.router, prefix="/api/v1/jobs",        tags=["Jobs"])
app.include_router(files.router,       prefix="/api/v1/files",       tags=["Files"])
app.include_router(admin_api.router,   prefix="/api/v1/admin",       tags=["Admin"])
app.include_router(ws_api.router)  # WebSocket: /ws/{user_id}


@app.get("/", tags=["Health"])
async def root():
    return {"status": "ok", "app": settings.APP_NAME, "version": settings.APP_VERSION}


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy"}
