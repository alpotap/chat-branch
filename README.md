# ChatBranch - Git for Chat

Create branching conversations with AI models - like Git, but for chat. Start a conversation, then branch off at any point to explore different directions without losing context.

## Features

- **Visual Branching**: Right-click any message to create a new conversation branch
- **Tree Visualization**: See your entire conversation as a visual tree with React Flow
- **Multi-LLM Support**: Switch between GPT, Claude, and other models mid-conversation
- **Branch Navigation**: Switch between different conversation branches seamlessly
- **Persistent Storage**: All conversations and branches saved in PostgreSQL
- **Demo Mode**: Test the system without using API credits

## Quick Start

1. **Setup:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # or venv\Scripts\activate on Windows
   pip install -r requirements.txt
   ```

2. **Database:**
   ```bash
   python database/setup.py
   cp backend/.env.example backend/.env
   python database/init_tables.py
   ```

3. **Frontend:**
   ```bash
   cd frontend && npm install && cd ..
   ```

4. **Run:**
   ```bash
   # Terminal 1 - Backend
   cd backend && uvicorn main:app --reload
   
   # Terminal 2 - Frontend  
   cd frontend && npm start
   ```

5. **Open:** http://localhost:3000

## How to Use

1. Create conversations and send messages to AI models
2. Right-click any message to create a branch from that point
3. Switch between Chat/Tree views to see conversation structure
4. Select different branches to continue conversations independently
5. Change AI models anytime during conversations

## Configuration

Edit `backend/.env`:

```env
# Database (created by setup script)
DATABASE_URL=postgresql://chatbranch_user:chatbranch_password@localhost/chatbranch

# Demo mode (no API keys needed)
USE_DUMMY_RESPONSES=true

# LLM API Keys (set USE_DUMMY_RESPONSES=false to use these)
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
```

## Project Structure

```
ChatBranch/
├── backend/           # FastAPI backend
│   ├── app/          # Application code
│   ├── main.py       # FastAPI entry point
│   └── .env          # Environment variables
├── frontend/         # React frontend
│   ├── src/          # React components
│   └── package.json  # Dependencies
├── database/         # Database setup scripts
└── requirements.txt  # Python dependencies
```

## Development

- **Test API:** `python test_api.py`
- **Backend:** http://localhost:8000 (FastAPI auto-docs at /docs)
- **Frontend:** http://localhost:3000
- **Database:** PostgreSQL with tree-structured message storage

## Troubleshooting

- **PostgreSQL issues:** Run `sudo service postgresql start` on Linux
- **Frontend errors:** Run `npm install` in frontend directory
- **Python errors:** Activate venv with `source venv/bin/activate`
