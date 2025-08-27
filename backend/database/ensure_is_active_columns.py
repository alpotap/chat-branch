#!/usr/bin/env python3
"""
Run this script to ensure the `is_active` columns exist on critical tables.

It will run ALTER TABLE ... ADD COLUMN IF NOT EXISTS for safety and set a default True.

Usage (from repo root):
  # using the repo venv (Windows PowerShell example)
  & "./venv/Scripts/Activate.ps1"; python backend\database\ensure_is_active_columns.py

  # inside Docker container running the backend service
  docker compose exec backend python backend/database/ensure_is_active_columns.py

This is a small, idempotent helper to run when you don't yet have Alembic migrations.
Prefer creating a proper Alembic revision for production; this script is a safe stop-gap.
"""
import os
from sqlalchemy import text, create_engine
from dotenv import load_dotenv

load_dotenv()

def main():
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        print('ERROR: DATABASE_URL environment variable not set')
        return 1

    engine = create_engine(database_url)

    print("🔧 Ensuring is_active columns exist on branches and messages...")
    statements = [
        "ALTER TABLE branches ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;",
        "ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;",
        # Ensure default is set to true (some DBs may ignore default clause on IF NOT EXISTS)
        "ALTER TABLE branches ALTER COLUMN is_active SET DEFAULT true;",
        "ALTER TABLE messages ALTER COLUMN is_active SET DEFAULT true;",
    ]

    with engine.begin() as conn:
        for stmt in statements:
            try:
                print('> ', stmt)
                conn.execute(text(stmt))
            except Exception as e:
                print(f"Warning: statement failed: {e}")

    print("✅ Done. If you run into permission or migration policy issues, consider creating a proper migration.")
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
