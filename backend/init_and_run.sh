#!/bin/bash
set -e

echo "🔍 Waiting for PostgreSQL to be ready..."
until pg_isready -h postgres -p 5432 -U chatbranch; do
  echo "⏳ Database not ready, waiting..."
  sleep 2
done
echo "✅ Database is ready!"

echo "🗄️ Setting up database schema..."
python database/init_tables.py || echo "❌ Schema setup failed"

echo "🚀 Starting FastAPI application..."
uvicorn main:app --host 0.0.0.0 --port 8001 --reload &
FASTAPI_PID=$!

echo "⏳ Waiting for FastAPI to start..."
sleep 5

echo "👥 Creating initial users..."
python scripts/add_user.py admin@123 admin123 --admin || echo "❌ Admin user creation failed"
python scripts/add_user.py test@123 test123 || echo "❌ Test user creation failed"
echo "✅ Initial users created successfully"

wait $FASTAPI_PID
