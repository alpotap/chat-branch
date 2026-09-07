# 🚀 ChatBranch Developer Quick Start

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Docker Desktop | current | Only thing needed for the Docker path |
| Python | **3.11** (3.10–3.12 also fine) | ⚠️ **3.13 / 3.14 will fail** — see below |
| Node.js | 18+ | Only for local frontend dev |
| PostgreSQL | 15 | **Not needed** when running with Docker |

### ⚠️ Python version matters

The pinned dependencies (`psycopg2-binary`, `pydantic-core`, `numpy`) ship pre-built wheels only up
to Python 3.12. On Python 3.13/3.14 `pip install -r requirements.txt` tries to compile from source
and fails with errors like `Microsoft Visual C++ 14.0 or greater is required` or
`pg_config executable not found`. The container image uses **Python 3.11**, so match it locally.

Check what you have:

```powershell
py --list      # Windows
python3 -V     # Linux/macOS
```

Install Python 3.11 alongside your newer version (they can coexist):

```powershell
# Windows
winget install --id Python.Python.3.11 -e
# or download: https://www.python.org/downloads/release/python-3119/
```

```bash
# macOS
brew install python@3.11

# Ubuntu/Debian
sudo add-apt-repository ppa:deadsnakes/ppa && sudo apt update
sudo apt install python3.11 python3.11-venv
```

### ⚠️ Things the repository does NOT contain

`.gitignore` excludes them, so a fresh clone will not have them and you must create them yourself:

| Missing after clone | How to create |
|---|---|
| `backend/.env` | `Copy-Item backend\.env.example backend\.env` (PowerShell) or `cp backend/.env.example backend/.env` |
| `backend/.venv` (virtualenv) | `py -3.11 -m venv .venv` — see below |
| `frontend/node_modules` | `npm install` |

Without `backend/.env`, `docker compose up --build` used to abort with
`env file backend/.env not found`. The compose file now marks it optional, but you still want the
file so your API keys and settings are picked up.

## Setup

```powershell
# Clone and enter directory
git clone https://github.com/keshavnath/chat-branch.git
cd chat-branch

# Environment file (required - not in git)
Copy-Item backend\.env.example backend\.env
```

If you only want to run the stack, stop here and go to **Run Application → Docker**.
For local (non-Docker) development continue:

```powershell
# Backend setup - note the explicit 3.11 interpreter
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1        # Linux/macOS: source .venv/bin/activate
python -V                            # must print 3.11.x
pip install -r requirements.txt

# Database setup (needs a local PostgreSQL - skip if using Docker for the DB)
python database/setup.py
python database/init_tables.py

# Frontend setup
cd ../frontend
npm install
```

If PowerShell blocks the activation script, run
`Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned` first.

Tip: you can run only the database in Docker and keep the app local:

```bash
docker compose up -d postgres
```

Then set `DATABASE_URL=postgresql://chatbranch:chatbranch_password@localhost:5432/chatbranch`
in `backend/.env`.

## Run Application

Preferred: run with Docker

From the repository root:

```bash
docker compose up --build
```

This builds the images and starts the full stack (Backend, UI, DB). Frontend will be available at http://localhost:3001 and the API will be proxied under http://localhost:3001/api by the bundled nginx in the frontend image.

Run it from the **repository root** (not from `backend/`) — Compose resolves `./backend` and
`./frontend` relative to the file location.

The `postgres` container publishes port 5432. If you already run PostgreSQL locally, that port is
taken; change the mapping to `"5433:5432"` in `docker-compose.yml`.

Stop and remove containers:

```bash
docker compose down
```

Local development (alternate, non-Docker)

If you prefer to run services locally for iterative development, run backend and frontend in separate terminals:

**Terminal 1 - Backend:**
```bash
cd backend
uvicorn main:app --reload --port 8001
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm start
```

Frontend dev server runs on http://localhost:3000 by default and will proxy API calls to the backend dev server at http://localhost:8001.

## Default demo user

For quick testing you can create a demo user account. There is no built-in password in the image by default, but you can create one with the helper script in the backend. Example credentials we use for demos:

- Email: demo@chatbranch.local
- Password: demo123

To create this user quickly (from the repo root):

```bash
cd backend
python scripts/add_user.py demo@chatbranch.local demo123 --force
```

When deploying via docker, two users are created by default.

## Key Features to Test

### Basic Usage
- **Chat**: Type messages, get AI responses (dummy mode enabled)
- **Branching**: Right-click any message → "Create Branch"
- **Navigation**: Use ◀▶ buttons for back/forward within conversations
- **Views**: Toggle Chat/Tree view to see conversation structure
- **Models**: Switch AI models mid-conversation

### URLs to Check
- **Frontend (Docker)**: http://localhost:3001
- **Frontend (local dev)**: http://localhost:3000
- **API Docs (local dev)**: http://localhost:8001/docs

## File Structure
```
ChatBranch/
├── backend/
│   ├── app/models.py          # Database models
│   ├── main.py                # FastAPI app
│   ├── scripts/               # User management scripts
│   ├── database/              # Schema setup scripts
│   ├── requirements.txt       # Python dependencies (Python 3.11)
│   ├── .env.example           # Template - copy to .env
│   └── .env                   # Config (git-ignored, create it yourself)
├── frontend/src/
│   ├── App.tsx                # Main component + routing
│   ├── TreeView.tsx           # Conversation tree
│   └── components/            # React components
└── docker-compose.yml         # Docker deployment
```

Note: when running via Docker, PostgreSQL runs as a service defined in `docker-compose.yml` (service name `postgres`).

## Database schema & branching model (current)

Brief overview of the current database schema and how branching is represented:

- `users`: stores user accounts (`id`, `email`, `password_hash`, `name`, `role`, `is_active`, `created_at`).
- `conversations`: top-level conversation records (`id`, `title`, `user_id`, timestamps).
- `messages`: stores all messages with a `parent_id` (points to another message), `branch_name` (string, default `main`), `role` (`user`/`assistant`/`system`), `llm_model` and provider fields, plus `is_active` for soft-deletes.
- `branches`: explicit branch records (`id`, `conversation_id`, `user_id`, `name`, `created_from_message_id`, `color`, `is_active`) used to surface branch metadata in the UI.

Branching model notes:

- Each message belongs to a conversation and optionally references a `parent_id` to form a tree.
- `branch_name` on messages indicates which logical branch that message belongs to; the UI uses this plus explicit `branches` records to show branch metadata and colors.
- Creating a branch typically records a `Branch` with `created_from_message_id` pointing to the message where the branch was created and subsequent messages in that branch carry `branch_name` set to the new branch.
- Soft-delete and `is_active` flags exist on messages/branches so the app can hide or preserve historical records without hard-deleting rows.

This brief description matches the current models under `backend/app/models.py` and is sufficient for basic developer understanding and debugging. For schema changes, update the models and run the DB setup helpers in `backend/database/` as needed.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `env file .../backend/.env not found` | Copy `backend/.env.example` to `backend/.env`, and run `docker compose` from the repo root |
| `pip install` fails building `psycopg2`/`pydantic-core` wheels | You are on Python 3.13/3.14 — recreate the venv with `py -3.11 -m venv .venv` |
| `Ports are not available: 0.0.0.0:5432` | A local PostgreSQL is already listening; remap the port in `docker-compose.yml` |
| Ollama models missing from the dropdown | Ollama binds to `127.0.0.1` by default; set `OLLAMA_HOST=0.0.0.0:11434` and restart it (see `DOCKER_README.md`) |
| `.\.venv\Scripts\Activate.ps1 cannot be loaded` | `Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned` |
| Port conflicts on 3000/3001/8001 | Stop the process using the port or change the mapping |
| Database connection fails locally | Re-run `python database/setup.py` and confirm `DATABASE_URL` in `backend/.env` |

## Development Notes

- **Demo mode**: Uses dummy responses (no API keys needed)
- **Auto-reload**: Both frontend and backend reload on changes
- **Browser nav**: Each conversation has its own URL
- **Real LLMs**: Set `USE_DUMMY_RESPONSES=false` in `backend/.env` and add API keys
- **Local models**: Ollama models on the host appear as `ollama/<name>` and work without any API key

<!-- Alembic migrations removed from quickstart: migrations are already applied in the schema/setup and are not required for basic developer runs. -->
