# 🚀 ChatBranch Quick Start Guide

## What You Have

A working ChatBranch application with:

- **Visual Branching**: Right-click messages to create conversation branches
- **Tree Visualization**: React Flow-based tree view of conversation structure
- **Multi-LLM Support**: Switch between GPT, Claude, and other models
- **Branch Navigation**: Switch between different conversation branches
- **Demo Mode**: Test without API credits using dummy responses

## Quick Setup (5 minutes)

### 1. Prerequisites
- Python 3.9+
- Node.js 18+
- PostgreSQL

### 2. Setup Environment

```bash
# Create virtual environment in root
python -m venv venv

# Activate (Windows)
venv\Scripts\activate
# Activate (Linux/macOS)  
source venv/bin/activate

# Install all dependencies
pip install -r requirements.txt
```

### 3. Setup Database

```bash
python database/setup.py
```

### 4. Configure Environment

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your API keys (optional for demo mode)
```

### 5. Initialize Database

```bash
python database/init_tables.py
```

### 6. Setup Frontend

```bash
cd frontend
npm install
cd ..
```

### 7. Run Application

**Backend:**
```bash
cd backend
uvicorn main:app --reload
```

**Frontend:**
```bash
cd frontend
npm start
```

### 8. Open Application

Visit: <http://localhost:3000>

## How to Use

### Creating Branches
1. **Start a conversation** by typing a message
2. **Right-click any message** to see context menu
3. **Select "Branch from here"** to create a new branch
4. **Name your branch** and continue the conversation

### Viewing Branches
1. **Toggle between Chat/Tree views** using the view switcher
2. **See visual tree structure** in Tree view
3. **Click messages in tree** to select them
4. **Switch branches** using the branch selector

### Changing Models
1. **Select different AI models** from dropdown
2. **Continue conversation** with new model
## API Endpoints (for Postman testing)

**Base URL**: `http://localhost:8000`

### Create Conversation
```http
POST /conversations
Content-Type: application/json

{
  "title": "My Test Conversation"
}
```

### Add Message
```http
POST /conversations/{conversation_id}/messages
Content-Type: application/json

{
  "content": "Hello, how does quantum computing work?",
  "role": "user",
  "branch_name": "main",
  "llm_model": "gpt-3.5-turbo"
}
```

### Get Conversation Tree
```http
GET /conversations/{conversation_id}
```

### Create Branch
```http
POST /conversations/{conversation_id}/branch
Content-Type: application/json

{
  "name": "Alternative Discussion",
  "created_from_message_id": "{message_id}",
  "color": "#FF6B6B"
}
```

## What's Working

✅ **Basic Chat**: Send messages and get AI responses  
✅ **Multiple Models**: Switch between GPT, Claude, etc.  
✅ **Message Storage**: All conversations saved in PostgreSQL  
✅ **Tree Structure**: Backend handles branching logic  
✅ **Visual Tree**: React Flow integration for conversation visualization  
✅ **Branching UI**: Right-click to branch from any message  
✅ **Branch Navigation**: Switch between conversation branches  
✅ **Demo Mode**: Test without API credits using dummy responses  

## Troubleshooting

**Backend won't start**: Check PostgreSQL is running (`sudo service postgresql start`)  
**Frontend errors**: Run `npm install` in frontend folder  
**API key errors**: Check `.env` file has valid keys  
**Database errors**: Run `python database/setup.py` again  

## File Structure
```
ChatBranch/
├── backend/
│   ├── app/
│   │   ├── models.py      # Database models
│   │   ├── schemas.py     # Pydantic schemas
│   │   ├── services.py    # Business logic
│   │   └── database.py    # DB connection
│   ├── main.py            # FastAPI app
│   └── .env               # Environment variables
├── frontend/
│   ├── src/
│   │   ├── App.tsx        # Main React component
│   │   ├── TreeView.tsx   # Tree visualization
│   │   ├── MessageBubble.tsx # Message components
│   │   └── App.css        # Styles
│   └── package.json
├── database/
│   ├── setup.py           # Database setup
│   └── init_tables.py     # Table creation
├── test_api.py            # API testing script
└── requirements.txt       # Python dependencies
```

You now have a fully working Git-for-Chat application! 🎉

## Known Issues

**Branch Messages Not Showing**: If messages sent on a branch don't appear in chat view, refresh the conversation or switch between branches to reload the message cache.

**Performance**: Large conversation trees may render slowly in tree view - consider pagination for production use.
