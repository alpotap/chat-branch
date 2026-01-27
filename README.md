# ChatBranch - Git for Chat

Transform your AI conversations with visual branching - like Git, but for chat. Start a conversation, then branch off at any point to explore different directions while preserving context.

## What is ChatBranch?

ChatBranch lets you have non-linear conversations with AI models. Instead of a single thread of messages, you can branch your conversation at any point to explore alternative topics, approaches, or solutions. Think of it as version control for your thoughts and discussions.

![Hero placeholder](docs/screenshots/hero-placeholder.png)


### Key Concepts

**🌳 Branching**: Create new conversation paths from any message without losing your original thread. Perfect for exploring "what if" scenarios or diving deeper into specific topics.

**👁️ Visualization**: Switch between Chat view (traditional message interface) and Tree view (visual diagram) to see the full structure of your branched conversations.

**🤖 Multi-Model Support**: Seamlessly switch between different AI models mid-conversation to compare responses or leverage different AI strengths.

## Core Features

### Visual Conversation Branching
- **Right-click any message** to create a new branch from that point
- **Name your branches** with descriptive labels for easy organization
- **Branch colors** help distinguish different conversation paths in tree view
- **Independent contexts** - each branch maintains its own conversation history

![Conversation view placeholder](docs/screenshots/conversation-placeholder.png)


### Intelligent Navigation
- **Use ◀▶ (Back/Forward) system** for navigating between conversation states
- **Branch switching** to jump between different conversation paths
- **Message selection** to resume conversations from specific points
- **Conversation persistence** - all your work is automatically saved

### Tree Visualization
- **Interactive tree diagram** showing your entire conversation structure
- **Click any message** in the tree to jump to that point
- **Visual branch relationships** to understand conversation flow
- **Zoom and pan** to navigate large conversation trees

![Tree view placeholder](docs/screenshots/tree-placeholder.png)

### Multi-Model Integration
- **Switch AI models** anytime during conversations
- **Compare responses** by branching and trying different models
- **Model-specific capabilities** - use the right AI for the right task
- **Seamless transitions** between different AI providers

![Model selector placeholder](docs/screenshots/models-placeholder.png)

### Demo Mode
- **Test without API costs** using built-in dummy responses
- **Explore all features** before connecting your own API keys
- **Perfect for learning** the branching workflow

## How It Works

### Starting a Conversation
1. **Create a new conversation** with a descriptive title
2. **Type your message** and send to start the conversation
3. **Choose your AI model** from the dropdown (GPT, Claude, etc.)
4. **Get AI response** and continue the conversation normally

### Creating Branches
1. **Right-click any message** (yours or the AI's) in the conversation
2. **Select "Branch from here"** from the context menu
3. **Name your branch** (e.g., "Alternative approach", "Deep dive")
4. **Continue the conversation** in this new direction
5. **Switch between branches** using the branch selector

### Navigating Your Conversation
- **Use undo/redo arrows** (◀ ▶) to step through conversation history
- **Switch to Tree view** to see the visual structure
- **Click messages in tree view** to jump to specific points
- **Use branch selector** to switch between conversation paths

### Managing Conversations
- **Conversation sidebar** shows all your saved conversations
- **Delete branches** you no longer need (except main branch)
- **Rename conversations** by clicking the edit icon
- **Automatic saving** preserves all your work

## Use Cases

### Research and Exploration
- **Compare different approaches** to solving a problem
- **Explore multiple angles** of a complex topic
- **Deep dive into specifics** without losing the main thread
- **Document your thinking process** with clear visual structure

### Writing and Brainstorming
- **Draft multiple versions** of content in parallel branches
- **Explore different writing styles** or tones
- **Develop ideas incrementally** while preserving alternatives
- **Collaborate with AI** on creative projects

### Problem Solving
- **Try different solution strategies** in separate branches
- **Compare AI model responses** to the same problem
- **Build on partial solutions** without losing progress
- **Document decision-making process** with clear paths

### Learning and Teaching
- **Explore concepts from multiple perspectives**
- **Create study guides** with branching topics
- **Compare different explanations** of complex subjects
- **Build knowledge trees** that grow with your understanding

## Technical Overview

ChatBranch consists of a React frontend for the user interface and a FastAPI backend for data management and AI integration. All conversations are stored in PostgreSQL with a tree structure that preserves the branching relationships between messages.

### Architecture Highlights
- **Tree-structured storage** preserves conversation branching relationships
- **Real-time updates** keep the interface synchronized with your actions
- **Efficient navigation** with intelligent state management
- **Scalable design** ready for multi-user deployment

### Browser-Like Navigation
- **URL-based routing** for conversations - each conversation has its own URL
- **Browser back/forward** works for switching between conversations
- **Within-conversation navigation** uses the built-in undo/redo system
- **Bookmarkable conversations** - share specific conversation URLs

## Tech Stack

- **FastAPI** — Backend API (Python)
- **React + TypeScript** — Frontend UI
- **OpenRouter** — LLM gateway for model calls
- **PostgreSQL** — Primary datastore (runs in Docker)
- **SQLAlchemy** — ORM for DB models
- **Docker** — Full Stack Deployment
- **Nginx** — Static frontend serving / proxy

## Deployment (Docker)

Preferred deployment for developers is via Docker. For full technical details and alternative local development steps, see `QUICKSTART.md`.

From the repository root run (recommended):

```bash
docker compose up --build -d
```

View logs:

```bash
docker compose logs -f frontend backend
```

Stop and remove containers:

```bash
docker compose down
```

For full developer setup (venv, npm install, DB setup, and local server runs) see `QUICKSTART.md`.



## Support and Contributing

This project is actively developed. For development setup and commands, follow `QUICKSTART.md`. Contributions and issues are welcome via GitHub.

### Future Ideas
- 📷 Document and Image upload support
- 🔄 Multi-user support (like Google Docs for AI Chats!)
- 📚Improved History Management for large contexts and long conversation chains

### Contributing
The codebase is designed for extensibility and contribution. Key areas for development include additional AI model integrations, advanced visualization features, and collaborative conversation tools.
