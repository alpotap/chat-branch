FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Copy scripts directory
COPY ../scripts ./scripts

# Create a script to initialize users after database is ready
RUN echo '#!/bin/bash\n\
echo "Waiting for database to be ready..."\n\
sleep 10\n\
echo "Creating initial users..."\n\
python scripts/add_user.py admin@123 admin123 --admin || echo "Admin user creation failed"\n\
python scripts/add_user.py test@123 test123 || echo "Test user creation failed"\n\
echo "Initial users created successfully"\n\
exec "$@"' > /app/init_and_run.sh && chmod +x /app/init_and_run.sh

# Expose port
EXPOSE 8001

# Use the initialization script as entrypoint
ENTRYPOINT ["/app/init_and_run.sh"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--reload"]
