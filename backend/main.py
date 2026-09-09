import sys
import os
from pathlib import Path

# Add the backend directory to Python path so we can import from app
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import List, Optional
import uuid
from datetime import datetime, timezone

from app.database import get_db, engine
from app.models import Base, Conversation, Message, Branch, User, Folder, NoteFolder, Note, NoteText
from app.schemas import (
    ConversationCreate, ConversationResponse, 
    MessageCreate, MessageResponse,
    BranchCreate, BranchResponse,
    ConversationTree, UserLogin, UserResponse, Token, LoginResponse,
    FolderCreate, FolderUpdate, FolderResponse, ConversationOrganize, SidebarOrder,
    NoteFolderCreate, NoteFolderUpdate, NoteFolderResponse,
    NoteCreate, NoteResponse, NoteOrganize, NotesSidebarOrder, NoteWithTexts,
    NoteTextCreate, NoteTextUpdate, NoteTextResponse, NoteTextReorder, SaveMessageToNote,
    SearchResponse
)
from app.services import ConversationService, LLMService, AuthService, NoteService, SearchService
from app.auth import verify_token

# Create tables
Base.metadata.create_all(bind=engine)
from database.init_tables import apply_schema_upgrades
apply_schema_upgrades()

# Check for default users on startup
def check_user_setup():
    """Check if there are any users in the database and provide setup instructions"""
    from sqlalchemy.orm import sessionmaker
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    try:
        user_count = db.query(User).count()
        if user_count == 0:
            print("\n" + "="*60)
            print("🌿 CHATBRANCH FIRST TIME SETUP")
            print("="*60)
            print("No users found in the database.")
            print("To create your first user, run:")
            print("    python add_user.py admin@123 admin123 --admin")
            print("\n" + "="*60)
        else:
            print(f"✅ Database ready - {user_count} user(s) found")
    except Exception as e:
        print(f"Warning: Could not check user count: {e}")
    finally:
        db.close()

check_user_setup()

app = FastAPI(title="ChatBranch API", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security
security = HTTPBearer()

# Service instances
auth_service = AuthService()
conversation_service = ConversationService()
note_service = NoteService()
search_service = SearchService()
llm_service = LLMService()

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "ChatBranch API", "version": "1.0.0"}

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """Get current authenticated user from JWT token"""
    token = credentials.credentials
    payload = verify_token(token)
    
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id: str = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user = auth_service.get_user_by_id(db, user_id=user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return user

@app.get("/")
async def root():
    return {"message": "ChatBranch API is running"}

@app.get("/folders", response_model=List[FolderResponse])
async def list_folders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List the user's sidebar folders in manual order"""
    return [FolderResponse.model_validate(f) for f in conversation_service.list_folders(db, current_user.id)]

@app.post("/folders", response_model=FolderResponse)
async def create_folder(
    folder: FolderCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a sidebar folder"""
    created = conversation_service.create_folder(db, current_user.id, folder.name, folder.color)
    return FolderResponse.model_validate(created)

@app.patch("/folders/{folder_id}", response_model=FolderResponse)
async def update_folder(
    folder_id: str,
    folder: FolderUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Rename, recolor or reposition a folder"""
    try:
        updated = conversation_service.update_folder(
            db, folder_id, current_user.id, folder.name, folder.color, folder.position
        )
        return FolderResponse.model_validate(updated)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.delete("/folders/{folder_id}")
async def delete_folder(
    folder_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a folder; its conversations move back to the sidebar root"""
    if not conversation_service.delete_folder(db, folder_id, current_user.id):
        raise HTTPException(status_code=404, detail="Folder not found")
    return {"message": "Folder deleted"}

@app.get("/folders/archived", response_model=List[FolderResponse])
async def list_archived_folders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List the user's archived folders"""
    return [FolderResponse.model_validate(f) for f in conversation_service.list_archived_folders(db, current_user.id)]

@app.post("/folders/{folder_id}/archive", response_model=FolderResponse)
async def archive_folder(
    folder_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Archive a folder along with all conversations currently inside it"""
    if not conversation_service.archive_folder(db, folder_id, current_user.id):
        raise HTTPException(status_code=404, detail="Folder not found")
    updated = db.query(Folder).filter(Folder.id == folder_id, Folder.user_id == current_user.id).first()
    return FolderResponse.model_validate(updated)

@app.post("/folders/{folder_id}/restore", response_model=FolderResponse)
async def restore_folder(
    folder_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Restore an archived folder"""
    if not conversation_service.restore_folder(db, folder_id, current_user.id):
        raise HTTPException(status_code=404, detail="Folder not found")
    updated = db.query(Folder).filter(Folder.id == folder_id, Folder.user_id == current_user.id).first()
    return FolderResponse.model_validate(updated)

@app.put("/sidebar/order")
async def update_sidebar_order(
    order: SidebarOrder,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Persist folder/conversation ordering and folder membership after a drag & drop"""
    conversation_service.apply_sidebar_order(
        db,
        current_user.id,
        [item.model_dump() for item in order.folders],
        [item.model_dump() for item in order.conversations],
    )
    return {"message": "Sidebar order updated"}

@app.get("/models/ollama")
async def list_ollama_models(current_user: User = Depends(get_current_user)):
    """List models installed in the Ollama instance running on the Docker host"""
    return await llm_service.list_ollama_models()

# --- Notes: folders ---

@app.get("/note-folders", response_model=List[NoteFolderResponse])
async def list_note_folders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List the user's note folders in manual order"""
    return [NoteFolderResponse.model_validate(f) for f in note_service.list_note_folders(db, current_user.id)]

@app.post("/note-folders", response_model=NoteFolderResponse)
async def create_note_folder(
    folder: NoteFolderCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a note folder"""
    created = note_service.create_note_folder(db, current_user.id, folder.name, folder.color)
    return NoteFolderResponse.model_validate(created)

@app.patch("/note-folders/{folder_id}", response_model=NoteFolderResponse)
async def update_note_folder(
    folder_id: str,
    folder: NoteFolderUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Rename, recolor or reposition a note folder"""
    try:
        updated = note_service.update_note_folder(
            db, folder_id, current_user.id, folder.name, folder.color, folder.position
        )
        return NoteFolderResponse.model_validate(updated)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.delete("/note-folders/{folder_id}")
async def delete_note_folder(
    folder_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a note folder; its notes move back to the sidebar root"""
    if not note_service.delete_note_folder(db, folder_id, current_user.id):
        raise HTTPException(status_code=404, detail="Note folder not found")
    return {"message": "Note folder deleted"}

@app.get("/note-folders/archived", response_model=List[NoteFolderResponse])
async def list_archived_note_folders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List the user's archived note folders"""
    return [NoteFolderResponse.model_validate(f) for f in note_service.list_archived_note_folders(db, current_user.id)]

@app.post("/note-folders/{folder_id}/archive", response_model=NoteFolderResponse)
async def archive_note_folder(
    folder_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Archive a note folder along with all notes currently inside it"""
    if not note_service.archive_note_folder(db, folder_id, current_user.id):
        raise HTTPException(status_code=404, detail="Note folder not found")
    updated = db.query(NoteFolder).filter(NoteFolder.id == folder_id, NoteFolder.user_id == current_user.id).first()
    return NoteFolderResponse.model_validate(updated)

@app.post("/note-folders/{folder_id}/restore", response_model=NoteFolderResponse)
async def restore_note_folder(
    folder_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Restore an archived note folder"""
    if not note_service.restore_note_folder(db, folder_id, current_user.id):
        raise HTTPException(status_code=404, detail="Note folder not found")
    updated = db.query(NoteFolder).filter(NoteFolder.id == folder_id, NoteFolder.user_id == current_user.id).first()
    return NoteFolderResponse.model_validate(updated)

@app.put("/notes-sidebar/order")
async def update_notes_sidebar_order(
    order: NotesSidebarOrder,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Persist note folder/note ordering and folder membership after a drag & drop"""
    note_service.apply_notes_sidebar_order(
        db,
        current_user.id,
        [item.model_dump() for item in order.folders],
        [item.model_dump() for item in order.notes],
    )
    return {"message": "Notes sidebar order updated"}

# --- Notes ---

@app.post("/notes", response_model=NoteResponse)
async def create_note(
    note: NoteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new note"""
    created = note_service.create_note(db, current_user.id, note.title, note.folder_id)
    return NoteResponse.model_validate(created)

@app.get("/notes", response_model=List[NoteResponse])
async def list_notes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all notes for the current user"""
    return [NoteResponse.model_validate(n) for n in note_service.list_notes(db, current_user.id)]

@app.get("/notes/archived", response_model=List[NoteResponse])
async def list_archived_notes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all archived notes for the current user"""
    return [NoteResponse.model_validate(n) for n in note_service.list_archived_notes(db, current_user.id)]

@app.post("/notes/{note_id}/archive", response_model=NoteResponse)
async def archive_note(
    note_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Archive a note instead of deleting it"""
    if not note_service.archive_note(db, note_id, current_user.id):
        raise HTTPException(status_code=404, detail="Note not found")
    updated = note_service.get_note(db, note_id, current_user.id)
    return NoteResponse.model_validate(updated)

@app.post("/notes/{note_id}/restore", response_model=NoteResponse)
async def restore_note(
    note_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Restore an archived note"""
    if not note_service.restore_note(db, note_id, current_user.id):
        raise HTTPException(status_code=404, detail="Note not found")
    updated = note_service.get_note(db, note_id, current_user.id)
    return NoteResponse.model_validate(updated)

@app.get("/notes/{note_id}", response_model=NoteWithTexts)
async def get_note(
    note_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a note along with its ordered list of texts"""
    note = note_service.get_note(db, note_id, current_user.id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    texts = note_service.list_note_texts(db, note_id, current_user.id)
    result = NoteResponse.model_validate(note).model_dump()
    result["texts"] = [NoteTextResponse.model_validate(t) for t in texts]
    return result

@app.patch("/notes/{note_id}/organize", response_model=NoteResponse)
async def organize_note(
    note_id: str,
    organize: NoteOrganize,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Move a note into a folder, recolor it or change its position"""
    try:
        payload = organize.model_dump(exclude_unset=True)
        updated = note_service.organize_note(
            db,
            note_id,
            current_user.id,
            folder_id=organize.folder_id,
            color=organize.color,
            position=organize.position,
            clear_folder=('folder_id' in payload and organize.folder_id is None),
        )
        return NoteResponse.model_validate(updated)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.put("/notes/{note_id}/rename")
async def rename_note(
    note_id: str,
    new_title: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Rename a note"""
    try:
        note_service.rename_note(db, note_id, current_user.id, new_title)
        return {"message": "Note renamed successfully", "new_title": new_title}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.delete("/notes/{note_id}")
async def delete_note(
    note_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a note and all its texts"""
    if not note_service.delete_note(db, note_id, current_user.id):
        raise HTTPException(status_code=404, detail="Note not found")
    return {"message": "Note deleted successfully"}

# --- Note texts ---

@app.post("/notes/{note_id}/texts", response_model=NoteTextResponse)
async def create_note_text(
    note_id: str,
    text: NoteTextCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a text entry (manual or copied from a conversation) to the end of a note"""
    try:
        created = note_service.create_note_text(
            db, note_id, current_user.id, text.content,
            source_type=text.source_type or "manual",
            source_conversation_id=text.source_conversation_id,
            source_message_id=text.source_message_id,
            source_branch_name=text.source_branch_name,
            source_label=text.source_label,
        )
        return NoteTextResponse.model_validate(created)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.put("/notes/{note_id}/texts/reorder")
async def reorder_note_texts(
    note_id: str,
    reorder: NoteTextReorder,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Persist note text ordering after a drag & drop"""
    note_service.reorder_note_texts(
        db, note_id, current_user.id, [item.model_dump() for item in reorder.items]
    )
    return {"message": "Note text order updated"}

# Note: this dynamic {text_id} route must stay registered after the static "reorder" route above,
# otherwise FastAPI would match "reorder" as a text_id.
@app.put("/notes/{note_id}/texts/{text_id}", response_model=NoteTextResponse)
async def update_note_text(
    note_id: str,
    text_id: str,
    text: NoteTextUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Edit the content of a note text"""
    try:
        updated = note_service.update_note_text_content(db, note_id, text_id, current_user.id, text.content)
        return NoteTextResponse.model_validate(updated)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.delete("/notes/{note_id}/texts/{text_id}")
async def delete_note_text(
    note_id: str,
    text_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a note text"""
    if not note_service.delete_note_text(db, note_id, text_id, current_user.id):
        raise HTTPException(status_code=404, detail="Note text not found")
    return {"message": "Note text deleted"}


@app.post("/conversations/{conversation_id}/messages/{message_id}/save-to-note", response_model=NoteTextResponse)
async def save_message_to_note(
    conversation_id: str,
    message_id: str,
    payload: SaveMessageToNote,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Copy a message (or a selected portion of it) into a note as a new text entry"""
    conversation = conversation_service.get_conversation(db, conversation_id, current_user.id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    message = db.query(Message).filter(
        Message.id == message_id, Message.conversation_id == conversation_id, Message.user_id == current_user.id
    ).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    try:
        created = note_service.save_message_to_note(
            db, current_user.id, payload.note_id, payload.content,
            source_conversation_id=conversation_id,
            source_message_id=message_id,
            source_branch_name=message.branch_name,
            source_label=payload.source_label or conversation.title,
        )
        return NoteTextResponse.model_validate(created)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

# Authentication routes
@app.post("/auth/login", response_model=LoginResponse)
async def login(user_credentials: UserLogin, db: Session = Depends(get_db)):
    """Authenticate user and return access token"""
    user = auth_service.authenticate_user(db, user_credentials.email, user_credentials.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    
    token_data = auth_service.create_access_token_for_user(user)
    user_data = UserResponse.from_orm(user)
    
    return LoginResponse(
        access_token=token_data.access_token,
        token_type=token_data.token_type,
        expires_in=token_data.expires_in,
        user=user_data
    )

@app.get("/auth/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user information"""
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        name=current_user.name,
        role=current_user.role,
        is_admin=(current_user.role == "admin"),
        is_active=current_user.is_active,
        created_at=current_user.created_at
    )

@app.get("/search", response_model=SearchResponse)
async def search(
    q: str = "",
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Search the current user's notes and active chat content."""
    return SearchResponse(
        query=q,
        results=search_service.search(db, current_user.id, q, limit)
    )

@app.post("/conversations", response_model=ConversationResponse)
async def create_conversation(
    conversation: ConversationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new conversation"""
    db_conversation = conversation_service.create_conversation(db, conversation, current_user.id)
    
    # Explicitly convert to ensure proper serialization
    return ConversationResponse.model_validate(db_conversation)

@app.get("/conversations", response_model=List[ConversationResponse])
async def list_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all conversations for the current user"""
    conversations = conversation_service.list_conversations(db, current_user.id)
    return [ConversationResponse.model_validate(conv) for conv in conversations]

@app.get("/conversations/archived", response_model=List[ConversationResponse])
async def list_archived_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all archived conversations for the current user"""
    conversations = conversation_service.list_archived_conversations(db, current_user.id)
    return [ConversationResponse.model_validate(conv) for conv in conversations]

@app.post("/conversations/{conversation_id}/archive", response_model=ConversationResponse)
async def archive_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Archive a conversation instead of deleting it"""
    if not conversation_service.archive_conversation(db, conversation_id, current_user.id):
        raise HTTPException(status_code=404, detail="Conversation not found")
    updated = conversation_service.get_conversation(db, conversation_id, current_user.id)
    return ConversationResponse.model_validate(updated)

@app.post("/conversations/{conversation_id}/restore", response_model=ConversationResponse)
async def restore_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Restore an archived conversation"""
    if not conversation_service.restore_conversation(db, conversation_id, current_user.id):
        raise HTTPException(status_code=404, detail="Conversation not found")
    updated = conversation_service.get_conversation(db, conversation_id, current_user.id)
    return ConversationResponse.model_validate(updated)

@app.patch("/conversations/{conversation_id}/organize", response_model=ConversationResponse)
async def organize_conversation(
    conversation_id: str,
    organize: ConversationOrganize,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Move a conversation into a folder, recolor it or change its position"""
    try:
        payload = organize.model_dump(exclude_unset=True)
        updated = conversation_service.organize_conversation(
            db,
            conversation_id,
            current_user.id,
            folder_id=organize.folder_id,
            color=organize.color,
            position=organize.position,
            clear_folder=('folder_id' in payload and organize.folder_id is None),
        )
        return ConversationResponse.model_validate(updated)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/conversations/{conversation_id}", response_model=ConversationTree)
async def get_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get conversation with full tree structure"""
    conversation = conversation_service.get_conversation(db, conversation_id, current_user.id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    tree = conversation_service.build_conversation_tree(db, conversation_id, current_user.id)
    return tree

@app.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a conversation and all its messages and branches"""
    conversation = conversation_service.get_conversation(db, conversation_id, current_user.id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    conversation_service.delete_conversation(db, conversation_id, current_user.id)
    return {"message": "Conversation deleted successfully"}

@app.post("/conversations/{conversation_id}/messages", response_model=MessageResponse)
async def add_message(
    conversation_id: str,
    message: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a message to a conversation. If the message is from a user, it also generates and saves an AI response."""
    conversation = conversation_service.get_conversation(db, conversation_id, current_user.id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # If the message is not from a user, save it directly (e.g., system message)
    if message.role != "user":
        db_message = conversation_service.add_message(db, conversation_id, message, current_user.id)
        return MessageResponse.from_orm(db_message)

    # --- Transactional User Message and AI Response ---
    
    # 1. Get conversation context BEFORE adding the new user message
    context = conversation_service.get_message_context(
        db,
        conversation_id,
        message.branch_name,
        current_user.id
    )
    
    # 2. Append the new user message to the context in memory
    context.append({"role": "user", "content": message.content})
    
    # 3. Generate AI response
    try:
        # If no model was provided, treat this as an explicit demo request
        if not getattr(message, 'llm_model', None):
            message.llm_model = "demo-response"

        ai_response_content = await llm_service.generate_response(
            context,
            model=message.llm_model,
            client_api_key=getattr(message, 'client_api_key', None),
            provider_type=getattr(message, 'provider_type', None),
            base_url=getattr(message, 'provider_base_url', None)
        )
        
        # Handle empty or error-like responses from the LLM service
        if not ai_response_content or ai_response_content.strip() == "" or ai_response_content.strip().lower().startswith("error"):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="The AI model failed to generate a valid response."
            )

    except Exception as e:
        # If it's already an HTTPException, re-raise it. Otherwise, wrap it.
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"An error occurred with the AI service: {str(e)}"
        )

    # 4. Save both user and AI messages in a single transaction
    try:
        ai_db_message = conversation_service.add_user_and_ai_messages_transactional(
            db=db,
            conversation_id=conversation_id,
            user_message=message,
            ai_response_content=ai_response_content,
            user_id=current_user.id
        )
        return MessageResponse.from_orm(ai_db_message)
    except Exception as e:
        # This would catch database errors during the transaction
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save messages to the database: {str(e)}"
        )

@app.post("/conversations/{conversation_id}/branch", response_model=BranchResponse)
async def create_branch(
    conversation_id: str,
    branch: BranchCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new branch from a specific message"""
    try:
        # Validate conversation belongs to user
        conversation = conversation_service.get_conversation(db, conversation_id, current_user.id)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Protect against creating branches with reserved names
        PROTECTED_BRANCH_NAME = "main"  # TODO: Make this configurable per conversation
        if branch.name.lower() == PROTECTED_BRANCH_NAME.lower():
            raise HTTPException(status_code=400, detail=f"Cannot create branch with reserved name '{PROTECTED_BRANCH_NAME}'")
        
        # Check if branch name already exists
        existing_branch = db.query(Branch).filter(
            Branch.conversation_id == conversation_id,
            Branch.name == branch.name
        ).first()
        
        existing_messages = db.query(Message).filter(
            Message.conversation_id == conversation_id,
            Message.branch_name == branch.name
        ).first()
        
        if existing_branch or existing_messages:
            raise HTTPException(status_code=400, detail=f"Branch name '{branch.name}' already exists")
        
        db_branch = conversation_service.create_branch(db, conversation_id, branch, current_user.id)
        return BranchResponse(
            id=str(db_branch.id),
            name=db_branch.name,
            created_from_message_id=str(db_branch.created_from_message_id),
            created_at=db_branch.created_at,
            color=db_branch.color
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.patch("/conversations/{conversation_id}/branches/{branch_name}/color")
async def update_branch_color(
    conversation_id: str,
    branch_name: str,
    color_data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update the color of a branch"""
    try:
        print(f"🎨 [DEBUG] Updating branch color: conv={conversation_id[:8]}..., branch={branch_name}, color={color_data}")
        
        # Validate conversation belongs to user
        conversation = conversation_service.get_conversation(db, conversation_id, current_user.id)
        if not conversation:
            print(f"❌ [DEBUG] Conversation not found: {conversation_id}")
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        print(f"✅ [DEBUG] Conversation found: {conversation.title}")
        
        # Get the color from the request data
        color = color_data.get("color")
        if not color:
            print(f"❌ [DEBUG] No color provided in request data: {color_data}")
            raise HTTPException(status_code=400, detail="Color is required")
        
        print(f"🎨 [DEBUG] Color to set: {color}")
        
        # Update the branch color
        branch = db.query(Branch).filter(
            Branch.conversation_id == conversation_id,
            Branch.name == branch_name
        ).first()
        
        print(f"🔍 [DEBUG] Existing branch record: {branch}")
        
        if not branch:
            # Special handling for main branch - create a Branch record if it doesn't exist
            if branch_name == "main":
                print(f"🌿 [DEBUG] Creating new main branch record...")
                # Create a Branch record for main branch
                from app.models import Message
                # Find the first message in the conversation to use as created_from_message_id
                first_message = db.query(Message).filter(
                    Message.conversation_id == conversation_id,
                    Message.branch_name == "main"
                ).order_by(Message.created_at).first()
                
                print(f"📝 [DEBUG] First message in main: {first_message.id if first_message else 'None'}")
                
                if first_message:
                    branch = Branch(
                        conversation_id=conversation_id,
                        name="main",
                        created_from_message_id=first_message.id,
                        color=color,
                        user_id=current_user.id,
                        created_at=datetime.utcnow()
                    )
                    db.add(branch)
                    print(f"✅ [DEBUG] Created new main branch record with color {color}")
                else:
                    print(f"❌ [DEBUG] No messages found in main branch")
                    raise HTTPException(status_code=404, detail="No messages found in main branch")
            else:
                print(f"❌ [DEBUG] Branch '{branch_name}' not found")
                raise HTTPException(status_code=404, detail="Branch not found")
        else:
            print(f"🔄 [DEBUG] Updating existing branch color from {branch.color} to {color}")
            branch.color = color
        
        print(f"💾 [DEBUG] Committing changes to database...")
        db.commit()
        print(f"✅ [DEBUG] Database commit successful")
        
        return {"message": "Branch color updated successfully", "color": color}
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        print(f"❌ [DEBUG] Unexpected error in update_branch_color: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.get("/conversations/{conversation_id}/context/{message_id}")
async def get_message_context(
    conversation_id: str,
    message_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get the context chain leading to a specific message"""
    # Validate conversation belongs to user
    conversation = conversation_service.get_conversation(db, conversation_id, current_user.id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # Get the message to find its branch
    message = db.query(Message).filter(
        Message.id == message_id,
        Message.user_id == current_user.id
    ).first()
    
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Get context for the message's branch up to that message
    context = conversation_service.get_message_context(
        db, 
        conversation_id, 
        message.branch_name, 
        current_user.id, 
        message_id
    )
    
    return {"context": context}

@app.get("/conversations/{conversation_id}/branches")
async def get_branches(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all branches in a conversation"""
    branches = conversation_service.get_branches(db, conversation_id, current_user.id)
    return {"branches": branches}

@app.patch("/conversations/{conversation_id}/branches/{branch_name}/rating")
async def update_branch_rating(
    conversation_id: str,
    branch_name: str,
    request: dict,  # Expects {"rating": 0-5}
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Set the 5-star rating of a branch"""
    try:
        rating = int(request.get("rating", 0))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Rating must be an integer between 0 and 5.")

    try:
        branch = conversation_service.set_branch_rating(db, conversation_id, branch_name, rating, current_user.id)
        return {"branch_name": branch.name, "rating": branch.rating}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/conversations/{conversation_id}/branches/{branch_name}/duplicate", response_model=ConversationResponse)
async def duplicate_branch_as_conversation(
    conversation_id: str,
    branch_name: str,
    request: dict = None,  # Optional {"title": "..."}
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Copy a branch and everything it inherits from its parents into a new conversation"""
    try:
        new_conversation = conversation_service.copy_branch_to_new_conversation(
            db, conversation_id, branch_name, current_user.id, (request or {}).get("title")
        )
        return ConversationResponse.model_validate(new_conversation)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to duplicate branch: {str(e)}")

@app.post("/conversations/{conversation_id}/messages/{message_id}/duplicate-full", response_model=ConversationResponse)
async def duplicate_full_context_as_conversation(
    conversation_id: str,
    message_id: str,
    request: dict = None,  # Optional {"title": "..."}
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Copy a message and all of its parents, across every intermediate branch, into a new conversation"""
    try:
        new_conversation = conversation_service.copy_full_context_to_new_conversation(
            db, conversation_id, message_id, current_user.id, (request or {}).get("title")
        )
        return ConversationResponse.model_validate(new_conversation)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to duplicate context: {str(e)}")

@app.put("/conversations/{conversation_id}/messages/{message_id}/content", response_model=MessageResponse)
async def update_message_content(
    conversation_id: str,
    message_id: str,
    request: dict,  # Expects {"content": "new content"}
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Edit any message (including AI responses) without regenerating replies.

    The edited text is what later messages in the branch will use as context.
    """
    new_content = request.get("content")
    if new_content is None or not str(new_content).strip():
        raise HTTPException(status_code=400, detail="New content not provided.")
    try:
        updated = conversation_service.update_message_content(
            db, conversation_id, message_id, new_content, current_user.id
        )
        return MessageResponse.from_orm(updated)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

async def _generate_summary(
    context: List[dict],
    model: Optional[str],
    client_api_key: Optional[str],
    instruction: str,
    provider_type: Optional[str] = None,
    provider_base_url: Optional[str] = None
) -> str:
    """Ask the LLM for a summary of the supplied context"""
    summary_context = list(context)
    summary_context.append({"role": "user", "content": instruction})
    try:
        summary = await llm_service.generate_response(
            summary_context,
            model=model or "demo-response",
            client_api_key=client_api_key,
            provider_type=provider_type,
            base_url=provider_base_url
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Summarization failed: {str(e)}")

    if not summary or not summary.strip():
        raise HTTPException(status_code=503, detail="The AI model returned an empty summary.")
    return summary.strip()

@app.post("/conversations/{conversation_id}/messages/{message_id}/summarize", response_model=MessageResponse)
async def summarize_message(
    conversation_id: str,
    message_id: str,
    request: dict = None,  # Optional {"llm_model": "...", "client_api_key": "..."}
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Summarize a single message and append the result as a summary message"""
    conversation = conversation_service.get_conversation(db, conversation_id, current_user.id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    message = db.query(Message).filter(
        Message.id == message_id,
        Message.conversation_id == conversation_id,
        Message.user_id == current_user.id
    ).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    options = request or {}
    summary = await _generate_summary(
        [{"role": "user", "content": message.content}],
        options.get("llm_model"),
        options.get("client_api_key"),
        "Summarize the message above concisely, keeping the key points and any decisions.",
        options.get("provider_type"),
        options.get("provider_base_url")
    )

    title = f"Summary of {conversation.title} {message.branch_name}"
    summary_message = conversation_service.add_summary_message(
        db, conversation_id, message.branch_name, f"**{title}**\n\n{summary}", current_user.id, options.get("llm_model")
    )
    return MessageResponse.from_orm(summary_message)

@app.post("/conversations/{conversation_id}/branches/{branch_name}/summarize", response_model=MessageResponse)
async def summarize_branch(
    conversation_id: str,
    branch_name: str,
    request: dict = None,  # Optional {"llm_model": "...", "client_api_key": "..."}
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Summarize a whole branch and append the result as a summary message"""
    conversation = conversation_service.get_conversation(db, conversation_id, current_user.id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    context = conversation_service.get_message_context(db, conversation_id, branch_name, current_user.id)
    if not context:
        raise HTTPException(status_code=400, detail=f"Branch '{branch_name}' has no messages to summarize.")

    options = request or {}
    summary = await _generate_summary(
        context,
        options.get("llm_model"),
        options.get("client_api_key"),
        "Summarize the conversation above concisely: the topic, key points, decisions and open questions.",
        options.get("provider_type"),
        options.get("provider_base_url")
    )

    title = f"Summary of {conversation.title} {branch_name}"
    summary_message = conversation_service.add_summary_message(
        db, conversation_id, branch_name, f"**{title}**\n\n{summary}", current_user.id, options.get("llm_model")
    )
    return MessageResponse.from_orm(summary_message)

@app.post("/conversations/{conversation_id}/messages/{message_id}/regenerate-branch")
async def regenerate_message_in_branch(
    conversation_id: str,
    message_id: str,
    request_body: dict,  # {"branch_name": "regen-main"}
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Regenerate an AI message by creating a new branch and copying the user message"""
    try:
        # Validate conversation belongs to user
        conversation = conversation_service.get_conversation(db, conversation_id, current_user.id)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Get branch name from request body
        branch_name = request_body.get("branch_name", "regen-main")
        
        # Create the regeneration branch and get the copied user message
        new_branch, new_user_message = conversation_service.regenerate_message_in_branch(
            db, conversation_id, message_id, branch_name, current_user.id
        )
        
        # Generate AI response for the copied user message
        context = conversation_service.get_message_context(
            db, conversation_id, new_branch.name, current_user.id
        )
        
        # Get the original AI message to use the same LLM model
        original_ai_message = db.query(Message).filter(
            Message.id == message_id,
            Message.conversation_id == conversation_id,
            Message.user_id == current_user.id,
            Message.role == "assistant"
        ).first()
        
        llm_model = original_ai_message.llm_model if (original_ai_message and original_ai_message.llm_model) else "demo-response"
        
        # Generate AI response (optional client-supplied key/provider override for this request)
        ai_response = await llm_service.generate_response(
            context,
            llm_model,
            client_api_key=request_body.get("client_api_key"),
            provider_type=request_body.get("provider_type"),
            base_url=request_body.get("provider_base_url")
        )
        
        # Create the AI message in the new branch
        ai_message_create = MessageCreate(
            content=ai_response,
            role="assistant",
            parent_id=str(new_user_message.id),  # Convert UUID to string
            branch_name=new_branch.name,
            llm_model=llm_model
        )
        
        ai_message = conversation_service.add_message(db, conversation_id, ai_message_create, current_user.id)
        
        return {
            "success": True,
            "branch": {
                "id": str(new_branch.id),
                "name": new_branch.name,
                "color": new_branch.color,
                "created_from_message_id": str(new_branch.created_from_message_id)
            },
            "user_message": {
                "id": str(new_user_message.id),
                "content": new_user_message.content,
                "role": new_user_message.role,
                "branch_name": new_user_message.branch_name
            },
            "ai_message": {
                "id": str(ai_message.id),
                "content": ai_message.content,
                "role": ai_message.role,
                "branch_name": ai_message.branch_name
            },
            "message": f"Created branch '{new_branch.name}' with regenerated response"
        }
        
    except ValueError as e:
        print(f"❌ Branch regeneration validation error: {str(e)}")
        raise HTTPException(status_code=400, detail="Unable to regenerate this message. Please try regenerating the most recent message in the conversation.")
    except Exception as e:
        print(f"❌ Branch regeneration unexpected error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="An error occurred while regenerating the message. Please try again.")

@app.post("/conversations/{conversation_id}/messages/{message_id}/regenerate-place")
async def regenerate_message_in_place(
    conversation_id: str,
    message_id: str,
    request_body: dict = None,  # Optional {"client_api_key": "...", "provider_type": "...", "provider_base_url": "..."}
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Regenerate an AI message in place by deleting the old one"""
    options = request_body or {}
    try:
        # Validate conversation belongs to user
        conversation = conversation_service.get_conversation(db, conversation_id, current_user.id)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Get the message to regenerate
        ai_message = db.query(Message).filter(
            Message.id == message_id,
            Message.conversation_id == conversation_id,
            Message.user_id == current_user.id,
            Message.role == "assistant"
        ).first()
        
        if not ai_message:
            raise HTTPException(status_code=404, detail="AI message not found")
        
        # Get the user message that prompted this AI response for regeneration
        user_message = db.query(Message).filter(
            Message.id == ai_message.parent_id,
            Message.conversation_id == conversation_id,
            Message.user_id == current_user.id,
            Message.role == "user"
        ).first()
        
        if not user_message:
            raise HTTPException(status_code=404, detail="Parent user message not found")
        
        # Get the message info for regeneration (this validates it can be regenerated)
        message_id, branch_name, llm_model = conversation_service.regenerate_message_in_place(
            db, conversation_id, message_id, current_user.id
        )
        
        # Get the user message that prompted this AI response for regeneration
        user_message = db.query(Message).filter(
            Message.id == ai_message.parent_id,
            Message.conversation_id == conversation_id,
            Message.user_id == current_user.id,
            Message.role == "user"
        ).first()
        
        if not user_message:
            raise HTTPException(status_code=404, detail="Parent user message not found")
        
        # Generate new AI response
        context = conversation_service.get_message_context(
            db, conversation_id, branch_name, current_user.id
        )
        
        # Generate AI response using LLM service
        ai_response = await llm_service.generate_response(
            context,
            llm_model,
            client_api_key=options.get("client_api_key"),
            provider_type=options.get("provider_type"),
            base_url=options.get("provider_base_url")
        )

        # Update the existing AI message content instead of deleting and recreating
        ai_message.content = ai_response
        ai_message.created_at = datetime.now(timezone.utc)  # Update timestamp
        db.commit()
        db.refresh(ai_message)

        return MessageResponse.from_orm(ai_message)

    except ValueError as e:
        print(f"❌ In-place regeneration validation error: {str(e)}")
        raise HTTPException(status_code=400, detail="Unable to regenerate this message. Please try regenerating the most recent message in the conversation.")
    except Exception as e:
        print(f"❌ In-place regeneration unexpected error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="An error occurred while regenerating the message. Please try again.")

@app.put("/conversations/{conversation_id}/messages/{message_id}", response_model=MessageResponse)
async def edit_message_in_place(
    conversation_id: str,
    message_id: str,
    request: dict, # Expects {"content": "new content", "client_api_key": "...", "provider_type": "...", "provider_base_url": "..."}
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Edit a user message in-place, only if it is a leaf node."""
    new_content = request.get("content")
    if not new_content:
        raise HTTPException(status_code=400, detail="New content not provided.")
    try:
        # Load the message and its direct children
        msg = db.query(Message).filter(
            Message.id == message_id,
            Message.conversation_id == conversation_id,
            Message.user_id == current_user.id
        ).first()
        if not msg:
            raise HTTPException(status_code=404, detail="Message not found or access denied.")

        children = db.query(Message).filter(Message.parent_id == message_id, Message.conversation_id == conversation_id).all()

        # If no children, simple in-place edit
        if not children:
            updated_message = conversation_service.edit_message_in_place(
                db, conversation_id, message_id, new_content, current_user.id
            )
            return MessageResponse.from_orm(updated_message)

        # If exactly one child and it's an assistant with no further children,
        # allow in-place edit by updating the user message and regenerating the assistant response.
        if len(children) == 1 and children[0].role == 'assistant':
            assistant_msg = children[0]
            # Ensure assistant message has no replies
            assistant_children_count = db.query(Message).filter(Message.parent_id == assistant_msg.id).count()
            if assistant_children_count == 0:
                # Update user message content
                msg.content = new_content
                db.commit()

                # Build context for regeneration and append updated user message
                context = conversation_service.get_message_context(db, conversation_id, msg.branch_name, current_user.id)
                context.append({"role": "user", "content": new_content})

                # Generate new AI response (use stored llm_model if present)
                try:
                    ai_response_content = await llm_service.generate_response(
                        context,
                        model=msg.llm_model or "demo-response",
                        client_api_key=request.get("client_api_key"),
                        provider_type=request.get("provider_type"),
                        base_url=request.get("provider_base_url")
                    )
                except Exception as e:
                    # Roll back user edit on LLM failure to avoid partial state
                    db.rollback()
                    raise HTTPException(status_code=503, detail=f"AI regeneration failed: {str(e)}")

                # Update assistant message content and timestamp
                assistant_msg.content = ai_response_content
                assistant_msg.created_at = datetime.now(timezone.utc)
                db.commit()
                db.refresh(msg)
                return MessageResponse.from_orm(msg)

        # Otherwise, not allowed
        raise HTTPException(status_code=400, detail="Cannot edit message in-place because it has replies. Consider editing as a new branch.")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/conversations/{conversation_id}/messages/{message_id}/edit-as-branch", response_model=MessageResponse)
async def edit_message_as_branch(
    conversation_id: str,
    message_id: str,
    request: dict, # Expects {"content": "new content", "client_api_key": "...", "provider_type": "...", "provider_base_url": "..."}
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Edit a user message by creating a new branch from its parent."""
    new_content = request.get("content")
    if not new_content:
        raise HTTPException(status_code=400, detail="New content not provided.")

    try:
        # 1. Create the new branch and get parameters for the new message
        params = conversation_service.edit_message_as_branch(
            db, conversation_id, message_id, current_user.id
        )
        
        # 2. Create the new message object for the API
        new_message_create = MessageCreate(
            content=new_content,
            role="user",
            parent_id=params["parent_id"],
            branch_name=params["branch_name"],
            llm_model=params["llm_model"]
        )

        # 3. Get context and generate AI response
        context = conversation_service.get_message_context(
            db, conversation_id, new_message_create.branch_name, current_user.id
        )
        context.append({"role": "user", "content": new_message_create.content})

        ai_response_content = await llm_service.generate_response(
            context,
            model=new_message_create.llm_model,
            client_api_key=request.get("client_api_key"),
            provider_type=request.get("provider_type"),
            base_url=request.get("provider_base_url")
        )
        if not ai_response_content or ai_response_content.strip() == "":
             raise HTTPException(status_code=503, detail="AI failed to generate a valid response.")

        # 4. Save both messages transactionally
        ai_db_message = conversation_service.add_user_and_ai_messages_transactional(
            db=db,
            conversation_id=conversation_id,
            user_message=new_message_create,
            ai_response_content=ai_response_content,
            user_id=current_user.id
        )
        return MessageResponse.from_orm(ai_db_message)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")


@app.get("/conversations/{conversation_id}/debug")
async def debug_conversation(
    conversation_id: str,
    db: Session = Depends(get_db)
):
    """Debug conversation integrity issues"""
    diagnostics = conversation_service.validate_conversation_integrity(db, conversation_id)
    return diagnostics


@app.post("/conversations/{conversation_id}/messages/{message_id}/soft-delete")
async def soft_delete_message(
    conversation_id: str,
    message_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Soft-delete the last user message in a branch (and optionally the branch).

    Rules enforced by service:
    - Only user messages may be deleted
    - Message must be active and must be a leaf (no active children)
    - If it is the only active message in a non-main branch, the branch is soft-deleted
    """
    try:
        # Validate conversation exists and belongs to user
        conversation = conversation_service.get_conversation(db, conversation_id, current_user.id)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")

        result = conversation_service.soft_delete_last_user_message(db, conversation_id, message_id, current_user.id)

        # Return the service result directly so clients can read deleted_ids at top-level
        return result

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to soft-delete message")

@app.post("/conversations/{conversation_id}/fix")
async def fix_conversation(
    conversation_id: str,
    db: Session = Depends(get_db)
):
    """Attempt to fix conversation integrity issues"""
    result = conversation_service.fix_conversation_integrity(db, conversation_id)
    return result

@app.put("/conversations/{conversation_id}/rename")
async def rename_conversation(
    conversation_id: str,
    new_title: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Rename a conversation"""
    conversation = conversation_service.get_conversation(db, conversation_id, current_user.id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    conversation.title = new_title
    db.commit()
    return {"message": "Conversation renamed successfully", "new_title": new_title}

@app.put("/conversations/{conversation_id}/branches/{branch_name}/rename")
async def rename_branch(
    conversation_id: str,
    branch_name: str,
    new_branch_name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Rename a branch and update all messages in that branch"""
    # Check if conversation exists and belongs to user
    conversation = conversation_service.get_conversation(db, conversation_id, current_user.id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # Protect main branch from being renamed (configurable in future)
    PROTECTED_BRANCH_NAME = "main"  # TODO: Make this configurable per conversation
    if branch_name == PROTECTED_BRANCH_NAME:
        raise HTTPException(status_code=400, detail=f"Cannot rename the '{PROTECTED_BRANCH_NAME}' branch")
    
    # Check if new branch name already exists (check both Branch table and Message table)
    existing_branch = db.query(Branch).filter(
        Branch.conversation_id == conversation_id,
        Branch.name == new_branch_name
    ).first()
    
    existing_messages = db.query(Message).filter(
        Message.conversation_id == conversation_id,
        Message.branch_name == new_branch_name
    ).first()
    
    if existing_branch or existing_messages:
        raise HTTPException(status_code=400, detail=f"Branch name '{new_branch_name}' already exists")
    
    # Also protect against renaming TO protected names
    PROTECTED_BRANCH_NAME = "main"  # TODO: Make this configurable per conversation
    if new_branch_name.lower() == PROTECTED_BRANCH_NAME.lower() and branch_name.lower() != PROTECTED_BRANCH_NAME.lower():
        raise HTTPException(status_code=400, detail=f"Cannot rename branch to reserved name '{PROTECTED_BRANCH_NAME}'")
    
    # Update all messages in the branch
    messages = db.query(Message).filter(
        Message.conversation_id == conversation_id,
        Message.branch_name == branch_name
    ).all()
    
    if not messages:
        raise HTTPException(status_code=404, detail="Branch not found")
    
    # Update the Branch record if it exists
    branch_record = db.query(Branch).filter(
        Branch.conversation_id == conversation_id,
        Branch.name == branch_name
    ).first()
    
    if branch_record:
        branch_record.name = new_branch_name
    
    # Update all message branch names
    for message in messages:
        message.branch_name = new_branch_name
    
    db.commit()
    return {"message": "Branch renamed successfully", "old_name": branch_name, "new_name": new_branch_name}

@app.delete("/conversations/{conversation_id}/branches/{branch_name}")
async def delete_branch(
    conversation_id: str,
    branch_name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a branch and all its messages with cascading delete of dependent branches"""
    try:
        # Check if conversation exists and belongs to user
        conversation = conversation_service.get_conversation(db, conversation_id, current_user.id)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Cannot delete main branch
        if branch_name == "main":
            raise HTTPException(status_code=400, detail="Cannot delete main branch")
        
        # Use cascading delete to remove the branch and all dependent branches
        deleted_branches = conversation_service.delete_branch_with_cascading(db, conversation_id, branch_name, current_user.id)
        
        return {
            "message": f"Successfully deleted branch '{branch_name}' and {len(deleted_branches)-1} dependent branches",
            "deleted_branches": deleted_branches
        }
        
    except ValueError as e:
        print(f"❌ Branch deletion validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"❌ Branch deletion unexpected error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to delete branch")

@app.get("/conversations/{conversation_id}/branches/{branch_name}/dependents")
async def get_dependent_branches(
    conversation_id: str,
    branch_name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all branches that depend on the specified branch"""
    try:
        # Check if conversation exists and belongs to user
        conversation = conversation_service.get_conversation(db, conversation_id, current_user.id)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Get dependent branches
        dependent_branches = conversation_service.get_dependent_branches(db, conversation_id, branch_name, current_user.id)
        
        return {
            "branch_name": branch_name,
            "dependent_branches": dependent_branches
        }
        
    except ValueError as e:
        print(f"❌ Error getting dependent branches: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"❌ Error getting dependent branches: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to get dependent branches")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
