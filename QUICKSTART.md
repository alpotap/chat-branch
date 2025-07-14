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

**Access:** http://localhost:3000

## Key Features to Test

### Basic Usage
- **Chat**: Type messages, get AI responses (dummy mode enabled)
- **Branching**: Right-click any message → "Create Branch"
- **Navigation**: Use ◀▶ buttons for undo/redo within conversations
- **Views**: Toggle Chat/Tree view to see conversation structure
- **Models**: Switch AI models mid-conversation

### URLs to Check
- **Frontend**: http://localhost:3000
- **API Docs**: http://localhost:8001/docs

## Quick API Test

```bash
# First, ensure backend is running:
# Terminal 1: cd backend && uvicorn main:app --reload --port 8001

# Test basic API
python test_api.py

# Test LLM context building (NEW!)
python test_context.py admin@example.com admin123

# Or manually test conversation creation
curl -X POST http://localhost:8001/conversations \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Conversation"}'
```

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
