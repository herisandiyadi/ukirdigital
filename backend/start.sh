#!/bin/zsh
# Start backend with proper error handling

cd /Users/herisandiyadi/Documents/png-converter-app/backend

echo "🚀 Starting PNG Converter Backend..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check Python version
echo "✅ Python version:"
python3 --version

# Check if venv/packages installed
echo "✅ Checking dependencies..."
python3 -c "import fastapi; print('  - FastAPI OK')" 2>/dev/null || echo "  ❌ FastAPI missing"
python3 -c "import sqlalchemy; print('  - SQLAlchemy OK')" 2>/dev/null || echo "  ❌ SQLAlchemy missing"
python3 -c "import anthropic; print('  - Anthropic OK')" 2>/dev/null || echo "  ❌ Anthropic missing"

# Check config
echo "✅ Checking configuration..."
python3 << 'CONFIGEOF'
from app.core.config import settings
print(f"  - APP_NAME: {settings.APP_NAME}")
print(f"  - DB: {settings.DATABASE_URL[:50]}...")
print(f"  - API Key: {bool(settings.ANTHROPIC_API_KEY)}")
CONFIGEOF

# Check database
echo "✅ Checking database connection..."
python3 << 'DBEOF'
import asyncio
from sqlalchemy import text
from app.core.database import engine

async def check_db():
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
            print("  ✅ Database connected")
    except Exception as e:
        print(f"  ❌ Database error: {str(e)[:100]}")

asyncio.run(check_db())
DBEOF

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔥 Starting server on http://localhost:8000"
echo "📚 API Docs: http://localhost:8000/docs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Start the server
python3 main.py
