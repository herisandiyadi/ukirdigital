#!/usr/bin/env bash
# Start backend secara lokal (tanpa Docker). Portabel: tidak ada path hardcoded.
# Pakai: ./start.sh   (dari folder backend/)
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🚀 Starting PNG Converter Backend..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

PY="${PYTHON:-python3}"
echo "✅ Python: $($PY --version 2>&1)"

echo "✅ Checking dependencies..."
for mod in fastapi sqlalchemy uvicorn; do
  if $PY -c "import $mod" 2>/dev/null; then
    echo "  - $mod OK"
  else
    echo "  ❌ $mod missing — jalankan: pip install -r requirements.txt"
    exit 1
  fi
done

echo "✅ Checking configuration..."
if [ -z "${SECRET_KEY:-}" ]; then
  echo "  ❌ SECRET_KEY belum di-set (lihat .env.example)"
  exit 1
fi

echo "✅ Applying migrations..."
$PY -m alembic upgrade head

echo ""
echo "🔥 Starting server on http://localhost:8000"
echo "📚 API Docs: http://localhost:8000/docs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

exec $PY -m uvicorn main:app --host 0.0.0.0 --port 8000
