# Ukir Digital

> Convert PNG / JPG / WEBP images to professional 3D formats — **STL**, **SVG**, and **DXF** — powered by **Anthropic Claude AI**.

---

## ✨ Features

| Category | Feature |
|---|---|
| **Conversion** | PNG/JPG/WEBP → STL (relief map), SVG (vector trace), DXF (CAD) |
| **AI Analysis** | Claude analyses each image and suggests optimal conversion settings |
| **Wizard UI** | 4-step guided flow: Upload → AI Analysis → Configure → Download |
| **3D Preview** | In-browser STL viewer with Three.js orbit controls |
| **Job History** | Filterable table with status badges + detail modal |
| **Real-time** | WebSocket push notifications for job progress / completion |
| **Admin Panel** | Dashboard with Recharts charts, user management, activity logs |
| **Limits System** | Per-user daily / monthly conversion quotas with 429 enforcement |
| **Email Service** | Welcome, verification, conversion-complete, limit-warning emails |
| **WhatsApp Verification** | SMS verification via Twilio WhatsApp API (optional) |
| **Maintenance** | APScheduler: stuck-job timeout, file cleanup, usage warnings |
| **Docker** | One-command Docker Compose deployment |

---

## 🏗️ Tech Stack

### Backend
- **FastAPI** 0.115 + Python 3.13
- **SQLAlchemy** 2 async + **asyncpg** (PostgreSQL)
- **Alembic** migrations
- **Anthropic** Claude (image analysis)
- **APScheduler** (background tasks)
- **Pillow**, **NumPy**, **ezdxf**, **svgwrite** (converters)
- **python-jose** JWT auth
- **Twilio** (WhatsApp verification, optional)

### Frontend
- **React 18** + **TypeScript** + **Vite 5**
- **Tailwind CSS 3** with custom component classes
- **Zustand** (auth store, persisted)
- **React Query** (server state)
- **React Hook Form** (forms)
- **React Dropzone** (file upload)
- **Three.js** / **@react-three/fiber** (STL 3D preview)
- **Recharts** (admin charts)
- **react-hot-toast** (notifications)

### Infrastructure
- **PostgreSQL 16**
- **Nginx** (reverse proxy + SPA serving)
- **Docker Compose**

---

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose v2
- (Local dev) Python 3.13+, Node 20+

### 1 — Clone & configure

```bash
git clone https://github.com/your-org/png-converter-app.git
cd png-converter-app

cp backend/.env.example backend/.env
# Edit backend/.env and fill in:
#   POSTGRES_PASSWORD, SECRET_KEY, ANTHROPIC_API_KEY
#   (Optional) TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER
```

### 2 — Run with Docker

```bash
make build    # build images (first time, ~2 min)
make up       # start postgres + backend + frontend
```

App is now available at **http://localhost** (port 80).

### 3 — Create first admin user

```bash
# exec into the backend container
docker compose exec backend python - <<'EOF'
import asyncio
from app.core.database import AsyncSessionLocal
from app.services.user_service import user_service
from app.schemas.user import UserCreate
from app.models.user import UserRole

async def main():
    async with AsyncSessionLocal() as db:
        u = await user_service.create(db, UserCreate(
            email="admin@example.com",
            username="admin",
            password="Admin1234!",
        ))
        u.role = UserRole.ADMIN
        u.is_verified = True
        await db.commit()
        print("Admin created:", u.email)

asyncio.run(main())
EOF
```

---

## 🖥️ Local Development

Di mode lokal, frontend Vite akan proxy request ke backend:

- REST API: `/api`  → `http://localhost:8000`
- WebSocket: `/ws` → `ws://localhost:8000`

### Backend (FastAPI) — run local

1) Siapkan env backend:

```bash
cp backend/.env.example backend/.env
# Edit backend/.env sesuai kebutuhan (minimal: DATABASE_URL, SECRET_KEY)
# NOTE: DEBUG harus boolean: true/false (jangan "WARN")
```

2) Jalankan PostgreSQL (pilih salah satu):

**Opsi A — Docker (paling mudah):**

```bash
docker compose up -d db
```

**Opsi B — PostgreSQL lokal:** pastikan `DATABASE_URL` mengarah ke instance lokal kamu.

3) Install dependency backend + jalankan server:

```bash
make install-backend

# (opsional tapi disarankan) jalankan migrasi
make migrate

# jalankan FastAPI (reload)
make dev-backend
```

Atau tanpa Makefile:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

alembic upgrade head
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend:
- Health check: http://localhost:8000/health
- API docs (Swagger): http://localhost:8000/docs

### Frontend (React + Vite) — run local

Di terminal terpisah:

```bash
make install-frontend
make dev-frontend
```

Atau tanpa Makefile:

```bash
cd frontend
npm install
npm run dev
```

Frontend dev server: http://localhost:5173

### Run everything via Docker Compose (production-like)

```bash
cp backend/.env.example backend/.env
# set POSTGRES_PASSWORD, SECRET_KEY, (optional) ANTHROPIC_API_KEY

make build
make up
```

App (nginx): http://localhost (default port 80)

---

## 📁 Project Structure

```
png-converter-app/
├── backend/
│   ├── main.py                     # FastAPI app, lifespan, routes
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth.py             # Register, login, refresh, verify
│   │   │   ├── conversions.py      # Upload, analyze, convert, download
│   │   │   ├── users.py            # /me, update profile, change password
│   │   │   ├── files.py            # Static file helpers
│   │   │   ├── admin.py            # Admin: stats, users, logs, settings
│   │   │   └── websocket.py        # WS /ws/{user_id}
│   │   ├── core/
│   │   │   ├── config.py           # Pydantic settings (.env)
│   │   │   ├── database.py         # AsyncEngine + session factory
│   │   │   ├── defaults.py         # Default limits + seed function
│   │   │   └── security.py         # JWT helpers, bcrypt, get_current_user
│   │   ├── models/                 # SQLAlchemy ORM models
│   │   ├── schemas/                # Pydantic request/response models
│   │   ├── services/
│   │   │   ├── ai_service.py       # Claude API wrapper
│   │   │   ├── conversion_service.py
│   │   │   ├── email_service.py    # SMTP + templates
│   │   │   ├── maintenance_service.py  # APScheduler tasks
│   │   │   └── user_service.py
│   │   └── utils/
│   │       ├── converters.py       # PNG → STL / SVG / DXF logic
│   │       └── file_handler.py
│   └── migrations/                 # Alembic versions
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx                 # Router + route guards
│   │   ├── main.tsx                # ReactDOM entry point
│   │   ├── components/
│   │   │   ├── AdminLayout.tsx
│   │   │   ├── UserLayout.tsx
│   │   │   ├── RequireAuth.tsx     # Route guards
│   │   │   └── StatusBadge.tsx
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts     # Auto-reconnect WS hook
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── RegisterPage.tsx
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── ConvertPage.tsx     # 4-step wizard
│   │   │   ├── HistoryPage.tsx
│   │   │   ├── SettingsPage.tsx
│   │   │   └── admin/
│   │   │       ├── AdminDashboardPage.tsx
│   │   │       ├── UsersPage.tsx
│   │   │       ├── DefaultLimitsPage.tsx
│   │   │       └── ActivityLogsPage.tsx
│   │   ├── services/
│   │   │   ├── api.ts              # Axios + JWT interceptor
│   │   │   ├── jobService.ts
│   │   │   └── adminService.ts
│   │   ├── store/
│   │   │   └── authStore.ts        # Zustand persisted store
│   │   └── types/
│   │       └── index.ts
│   ├── Dockerfile
│   └── nginx.conf
│
├── nginx/
│   └── nginx.conf                  # Production reverse proxy
├── docker-compose.yml
├── .env.example
├── Makefile
└── README.md
```

---

## 🔌 API Reference

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/register` | Register new user |
| POST | `/api/v1/auth/login` | Login → access + refresh tokens |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| POST | `/api/v1/auth/logout` | Logout (invalidate refresh) |
| GET  | `/api/v1/auth/verify-email` | Verify email token |

### Conversions
| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/v1/conversions/limits` | Current usage vs limits |
| POST | `/api/v1/conversions/analyze` | Upload image → Claude analysis |
| POST | `/api/v1/conversions/` | Start conversion job |
| GET  | `/api/v1/conversions/` | List my jobs |
| GET  | `/api/v1/conversions/{id}` | Get job by ID |
| DELETE | `/api/v1/conversions/{id}` | Delete job |
| GET  | `/api/v1/conversions/{id}/download` | Download output file |
| GET  | `/api/v1/conversions/{id}/download-all` | Download ZIP (all formats) |

### Admin
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/stats/overview` | Stats overview |
| GET | `/api/admin/stats/charts` | Chart data (last N days) |
| GET | `/api/admin/jobs` | All jobs with filters |
| GET | `/api/admin/users` | All users with search/filter |
| PUT | `/api/admin/users/{id}` | Update user role/status |
| PUT | `/api/admin/users/{id}/limits` | Update user quotas |
| POST | `/api/admin/users/{id}/suspend` | Toggle user suspension |
| DELETE | `/api/admin/users/{id}` | Delete user |
| GET | `/api/admin/logs` | Activity logs with filters |
| GET | `/api/admin/settings/defaults` | Get system defaults |
| PUT | `/api/admin/settings/defaults` | Update system defaults |
| GET | `/api/admin/settings/presets` | Get preset packages |
| PUT | `/api/admin/settings/presets` | Replace preset packages |

### WebSocket
```
WS /ws/{user_id}?token=<access_token>
```

**Server → Client events:**
```jsonc
{ "type": "job_status_update", "job_id": "...", "status": "processing", "progress": 45 }
{ "type": "job_completed",     "job_id": "...", "output_format": "stl", "download_url": "..." }
{ "type": "job_failed",        "job_id": "...", "error": "..." }
{ "type": "usage_limit_warning","used": 8, "max": 10, "scope": "daily", "percent": 80 }
```

---

## ⚙️ Configuration

All config via environment variables (see `.env.example`):

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | postgres://... | Async PostgreSQL URL |
| `SECRET_KEY` | — | JWT signing key (min 32 chars) |
| `ANTHROPIC_API_KEY` | — | Claude API key |
| `SMTP_HOST` | _(blank = mock)_ | SMTP server |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 15 | JWT access token TTL |
| `REFRESH_TOKEN_EXPIRE_DAYS` | 7 | JWT refresh token TTL |
| `MAX_FILE_SIZE_MB` | 10 | Upload size limit |
| `UPLOAD_DIR` | `uploads/` | Input file storage |
| `OUTPUT_DIR` | `outputs/` | Converted file storage |
350 | ---
351 | 
352 | ## 🧺 Git Ignore & Runtime Folders
353 | 
354 | Beberapa file/folder **tidak ikut ke git** karena hanya dibutuhkan saat runtime atau build:
355 | 
356 | - **Backend**
357 |   - `backend/.env` — konfigurasi rahasia (database, API key).
358 |   - `backend/.venv/` — virtualenv lokal.
359 |   - `backend/outputs/` — hasil konversi (STL/SVG/DXF/ZIP) disimpan di sini.
360 |   - `backend/uploads/` dan `backend/uploadsZ/` — file upload asli dari user.
361 | - **Frontend**
362 |   - `frontend/node_modules/` — dependency NPM.
363 |   - `frontend/dist/` — hasil build produksi Vite.
364 |   - `frontend/.env*` — konfigurasi environment frontend.
365 | - **Umum**
366 |   - File cache/editor: `.DS_Store`, `.vscode/`, `.idea/`, `*.log`, dll.
367 | 
368 | Folder runtime di‑keep dengan file `.gitignore` di dalamnya sehingga struktur proyek tetap lengkap, tapi isi file hasil konversi dan upload tidak membengkakkan repository.
369 | 
370 | ---
371 | 
372 | ## 📜 License
373 | 
374 | MIT © 2026 Ukir Digital

367 | MIT © 2026 Ukir Digital
