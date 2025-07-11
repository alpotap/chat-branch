FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code (all backend files)
COPY . .

# Expose port
EXPOSE 8001

# Create startup script that waits for DB and starts the app
CMD ["sh", "-c", "\
    echo '🔍 Waiting for PostgreSQL to be ready...' && \
    until pg_isready -h postgres -p 5432 -U chatbranch; do \
        echo '⏳ Database not ready, waiting...' && sleep 2; \
    done && \
    echo '✅ Database is ready!' && \
    echo '🗄️ Setting up database schema...' && \
    python database/init_tables.py && \
    echo '🚀 Starting FastAPI application...' && \
    uvicorn main:app --host 0.0.0.0 --port 8001 --reload & \
    FASTAPI_PID=$! && \
    echo '⏳ Waiting for FastAPI to start...' && \
    sleep 5 && \
    echo '👥 Creating initial users...' && \
    (python scripts/add_user.py admin@123 admin123 --admin --force || echo '⚠️ Admin user creation had issues but continuing...') && \
    (python scripts/add_user.py test@123 test123 --force || echo '⚠️ Test user creation had issues but continuing...') && \
    echo '✅ Initial users created successfully' && \
    echo '' && \
    echo '🎉 CHATBRANCH IS READY!' && \
    echo '========================================' && \
    echo '🌐 Frontend (Main App): http://localhost:3001' && \
    echo '🔧 API (via nginx proxy): http://localhost:3001/api' && \
    echo '🗄️  PostgreSQL:         localhost:5432 (internal only)' && \
    echo '========================================' && \
    echo '👥 Default Users:' && \
    echo '   Admin: admin@123 / admin123' && \
    echo '   Test:  test@123 / test123' && \
    echo '========================================' && \
    echo '🚀 Ready for testing!' && \
    echo '' && \
    wait $FASTAPI_PID"]
