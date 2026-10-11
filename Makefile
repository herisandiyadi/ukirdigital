.PHONY: help dev build up down logs ps clean migrate seed test lint format

# ── Variables ─────────────────────────────────────────────────────────────────
COMPOSE       = docker compose
BACKEND_DIR   = backend
FRONTEND_DIR  = frontend
PYTHON        = $(BACKEND_DIR)/.venv/bin/python
UVICORN       = $(BACKEND_DIR)/.venv/bin/uvicorn

# ── Help ──────────────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "  PNG Converter App — Makefile Commands"
	@echo "  ─────────────────────────────────────"
	@echo "  make dev          Start backend + frontend in dev mode (local)"
	@echo "  make build        Build Docker images"
	@echo "  make up           Start all services (Docker)"
	@echo "  make down         Stop all services"
	@echo "  make logs         Follow logs"
	@echo "  make ps           Show running containers"
	@echo "  make migrate      Run Alembic migrations"
	@echo "  make seed         Seed default settings"
	@echo "  make clean        Remove volumes + images"
	@echo "  make test         Run backend tests"
	@echo "  make lint         Lint backend (ruff)"
	@echo "  make format       Format backend (black)"
	@echo ""

# ── Local Dev ─────────────────────────────────────────────────────────────────
dev-backend:
	@echo "▶ Starting FastAPI backend..."
	cd $(BACKEND_DIR) && source .venv/bin/activate && \
	  uvicorn main:app --reload --host 0.0.0.0 --port 8000

dev-frontend:
	@echo "▶ Starting Vite frontend..."
	cd $(FRONTEND_DIR) && npm run dev

# Run both in parallel (requires iTerm / tmux or run in separate terminals)
dev:
	@echo "Run these in separate terminals:"
	@echo "  make dev-backend"
	@echo "  make dev-frontend"

# ── Docker ────────────────────────────────────────────────────────────────────
build:
	$(COMPOSE) build --no-cache

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

ps:
	$(COMPOSE) ps

# ── Database ──────────────────────────────────────────────────────────────────
migrate:
	cd $(BACKEND_DIR) && source .venv/bin/activate && \
	  alembic upgrade head

migrate-gen:
	cd $(BACKEND_DIR) && source .venv/bin/activate && \
	  alembic revision --autogenerate -m "$(MSG)"

seed:
	cd $(BACKEND_DIR) && source .venv/bin/activate && \
	  python -c "import asyncio; \
	    from app.core.database import AsyncSessionLocal; \
	    from app.core.defaults import seed_system_settings; \
	    asyncio.run(seed_system_settings(AsyncSessionLocal()))"

# ── Quality ───────────────────────────────────────────────────────────────────
# Tes dijalankan di image backend (Python 3.13 sama dengan produksi).
# Tidak bergantung .venv di host. Butuh: docker compose build backend
test:
	$(COMPOSE) run --rm --no-deps -v $(PWD)/$(BACKEND_DIR):/app -w /app \
	  -e PYTHONDONTWRITEBYTECODE=1 backend \
	  sh -c "pip install -q pytest pytest-asyncio && pytest -v -p no:cacheprovider"

lint:
	cd $(BACKEND_DIR) && source .venv/bin/activate && ruff check .

format:
	cd $(BACKEND_DIR) && source .venv/bin/activate && black .

# ── Clean ─────────────────────────────────────────────────────────────────────
clean:
	$(COMPOSE) down -v --rmi local
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .ruff_cache  -exec rm -rf {} + 2>/dev/null || true

# ── Install ───────────────────────────────────────────────────────────────────
install-backend:
	cd $(BACKEND_DIR) && python3 -m venv .venv && \
	  source .venv/bin/activate && pip install -r requirements.txt

install-frontend:
	cd $(FRONTEND_DIR) && npm install

install: install-backend install-frontend
