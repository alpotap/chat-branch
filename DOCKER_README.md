# 🐳 ChatBranch Docker Deployment

Easy Docker setup for ChatBranch testing with friends and developers.

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose installed
- OpenRouter API key (if you want real LLM responses)

### 1. Setup Environment
```bash
# .env files are not committed - create the backend one from the template:
cp backend/.env.example backend/.env      # PowerShell: Copy-Item backend\.env.example backend\.env

# For real LLM responses, edit backend/.env:
# Set USE_DUMMY_RESPONSES=false
# Set OPENROUTER_API_KEY=your_actual_openrouter_api_key_here

# For Docker deployment, uncomment this line in frontend/.env:
# REACT_APP_API_BASE=/api
```

> The database is provided by the `postgres` container - no local PostgreSQL install is needed.
> Compose overrides `DATABASE_URL` to point at that container. If port 5432 is already taken by a
> local PostgreSQL server, change the `postgres` port mapping in `docker-compose.yml` (e.g. `"5433:5432"`).

### 1b. Use Ollama models from the host (optional)

The backend can talk to the Ollama installation running on your Windows host through
`host.docker.internal`. Ollama binds to `127.0.0.1` by default, which containers cannot reach, so
tell it to listen on all interfaces:

```powershell
# Set once, then restart Ollama (quit it from the tray and start it again)
[Environment]::SetEnvironmentVariable("OLLAMA_HOST", "0.0.0.0:11434", "User")
```

Verify from inside the container after startup:

```bash
docker compose exec backend python -c "import urllib.request;print(urllib.request.urlopen('http://host.docker.internal:11434/api/tags').read()[:200])"
```

Installed Ollama models then appear in the model dropdown under **Ollama (local)** as
`ollama/<name>` (e.g. `ollama/llama3.2:latest`) and work regardless of `USE_DUMMY_RESPONSES`
since they need no API key. Use **Manage Models → Refresh Ollama Models** after pulling new ones.
Override the endpoint with `OLLAMA_BASE_URL` if Ollama runs elsewhere.

### 2. Start Services
```bash
# Build and start all services
docker-compose up --build -d

# View logs to see startup progress
docker-compose logs -f

# Check status
docker-compose ps
```

### 3. Access the Application
- **Frontend**: <http://localhost:3000>
- **Backend API**: <http://localhost:8001> (for debugging)
- **Database**: localhost:5432 (for debugging)

## 👥 Default Users

The system automatically creates two test users:
- **Admin**: `admin@123` / `admin123` (admin privileges)
- **Test**: `test@123` / `test123` (regular user)

## 🛠️ Management Commands

### Add New Users
```bash
# Add a regular user
docker exec -it chatbranch-backend python scripts/add_user.py friend@email.com password123

# Add an admin user
docker exec -it chatbranch-backend python scripts/add_user.py admin@email.com password123 --admin

# List all users
docker exec -it chatbranch-backend python scripts/remove_user.py --list
```

### Database Access
```bash
# Connect to PostgreSQL
docker exec -it chatbranch-postgres psql -U chatbranch -d chatbranch

# Example queries
SELECT * FROM users;
SELECT * FROM conversations;
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres
```

### Fix Database Issues
```bash
# Fix main branch problems
docker exec -it chatbranch-backend python scripts/fix_main_branches.py --list
docker exec -it chatbranch-backend python scripts/fix_main_branches.py --fix-all
```

## 🔧 Development

### Live Code Changes
The backend is mounted as a volume, so code changes are reflected immediately:
```bash
# Edit files locally
vim backend/main.py

# Backend automatically reloads (FastAPI --reload)
```

### Rebuild Frontend
If you change frontend code:
```bash
docker-compose build frontend
docker-compose up -d frontend
```

## 🐛 Troubleshooting

### Services Won't Start
```bash
# Check status
docker-compose ps

# View detailed logs
docker-compose logs

# Restart specific service
docker-compose restart backend
```

### Database Connection Issues
```bash
# Check if database is ready
docker exec -it chatbranch-postgres pg_isready -U chatbranch

# Reset database (WARNING: deletes all data)
docker-compose down -v
docker-compose up -d
```

### Port Conflicts
If ports 3000, 8001, or 5432 are busy, edit `docker-compose.yml`:
```yaml
ports:
  - "3001:80"    # Change frontend port
  - "8002:8001"  # Change backend port
  - "5433:5432"  # Change database port
```

## 🔒 Security Notes

- Database is accessible externally (port 5432) for debugging
- Backend API is accessible externally (port 8001) for debugging
- For production, remove external port mappings
- Change default database password in `.env`

## 📁 Docker Structure

```
ChatBranch/
├── docker-compose.yml          # Main orchestration
├── .env                        # Environment variables
├── backend/
│   ├── Dockerfile             # Backend container
│   └── (your backend code)
├── frontend/
│   ├── Dockerfile             # Frontend container
│   ├── nginx.conf             # Nginx configuration
│   └── (your frontend code)
└── scripts/                   # Mounted in backend container
    ├── add_user.py
    ├── remove_user.py
    └── fix_main_branches.py
```

## 🌐 Network Architecture

```
Internet → Nginx (Frontend) → API Proxy → FastAPI Backend → PostgreSQL
          Port 3000           /api/*      Port 8001       Port 5432
```

- Frontend serves React app and proxies `/api/*` to backend
- Backend connects to database via internal Docker network
- All services communicate via `chatbranch_network`

## 🛑 Shutdown

```bash
# Stop services (keeps data)
docker-compose down

# Stop and remove data
docker-compose down -v
```
