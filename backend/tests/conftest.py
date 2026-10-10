import os
import sys
from pathlib import Path

# Pastikan `app` bisa di-import dari folder backend/
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# config.py mewajibkan SECRET_KEY (BUG-S01). Nilai tes hanya untuk pytest.
os.environ.setdefault("SECRET_KEY", "test-only-secret-key-with-more-than-32-chars")
