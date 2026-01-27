# 🚀 ChatBranch Developer Quick Start

## Prerequisites
- **Python 3.9+**
- **Node.js 18+** 
- **PostgreSQL** (running locally)

## Setup

```bash
# Clone and enter directory
git clone https://github.com/keshavnath/chat-branch.git
cd ChatBranch

# Backend setup
cd backend
python -m venv venv
# Windows: venv\Scripts\activate
# Linux/macOS: source venv/bin/activate
pip install -r requirements.txt

# Database setup
python database/setup.py
python database/init_tables.py

# Frontend setup
cd ../frontend
npm install
```

## Run Application

Preferred: run with Docker

From the repository root:

```bash
docker compose up --build
```

This builds the images and starts the full stack (Backend, UI, DB). Frontend will be available at http://localhost:3001 and the API will be proxied under http://localhost:3001/api by the bundled nginx in the frontend image.

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
- **Frontend**: http://localhost:3000
- **API Docs**: http://localhost:8001/docs

## File Structure
```
ChatBranch/
├── backend/
│   ├── app/models.py          # Database models
│   ├── main.py                # FastAPI app
│   ├── scripts/               # User management scripts
│   ├── database/              # Schema setup scripts
│   ├── requirements.txt       # Python dependencies
│   └── .env                   # Config (auto-created)
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

**PostgreSQL**: `sudo service postgresql start` (Linux) or start service (Windows)  
**Port conflicts**: Kill processes on 3000/8001 if needed  
**Dependencies**: `pip install -r requirements.txt` and `npm install`  
**Database**: Re-run `python backend/database/setup.py` if connection fails  

## Development Notes

- **Demo mode**: Uses dummy responses (no API keys needed)
- **Auto-reload**: Both frontend and backend reload on changes
- **Browser nav**: Each conversation has its own URL
- **Real LLMs**: Set `USE_DUMMY_RESPONSES=false` in `backend/.env` and add API keys

<!-- Alembic migrations removed from quickstart: migrations are already applied in the schema/setup and are not required for basic developer runs. -->
