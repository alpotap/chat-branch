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
from datetime import datetime

from app.database import get_db, engine
from app.models import Base, Conversation, Message, Branch, User
from app.schemas import (
    ConversationCreate, ConversationResponse, 
    MessageCreate, MessageResponse,
    BranchCreate, BranchResponse,
    ConversationTree, UserLogin, UserResponse, Token, LoginResponse
)
from app.services import ConversationService, LLMService, AuthService
from app.auth import verify_token

# Create tables
Base.metadata.create_all(bind=engine)

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
            print("\n  Windows:")
            print("    add_user.bat admin@123 admin123 --admin")
            print("\n  Linux/Mac:")
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

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Services
conversation_service = ConversationService()
llm_service = LLMService()
auth_service = AuthService()

# Security
security = HTTPBearer()

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

@app.post("/conversations", response_model=ConversationResponse)
async def create_conversation(
    conversation: ConversationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new conversation"""
    db_conversation = conversation_service.create_conversation(db, conversation, current_user.id)
    
    # Explicitly convert to ensure proper serialization
    return ConversationResponse(
        id=str(db_conversation.id),
        title=db_conversation.title,
        created_at=db_conversation.created_at,
        updated_at=db_conversation.updated_at
    )

@app.get("/conversations", response_model=List[ConversationResponse])
async def list_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all conversations for the current user"""
    conversations = conversation_service.list_conversations(db, current_user.id)
    return [
        ConversationResponse(
            id=str(conv.id),
            title=conv.title,
            created_at=conv.created_at,
            updated_at=conv.updated_at
        ) 
        for conv in conversations
    ]

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
    """Add a message to a conversation"""
    # Check if conversation exists and belongs to user
    conversation = conversation_service.get_conversation(db, conversation_id, current_user.id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # Add user message
    db_message = conversation_service.add_message(db, conversation_id, message, current_user.id)
    
    # Generate AI response if user message
    if message.role == "user":
        # Get context for AI
        context = conversation_service.get_message_context(db, db_message.id, current_user.id)
        
        # Generate AI response
        ai_response = await llm_service.generate_response(
            context, 
            model=message.llm_model or "gpt-3.5-turbo"
        )
        
        # Save AI response
        ai_message = MessageCreate(
            content=ai_response,
            role="assistant",
            parent_id=str(db_message.id),  # Convert UUID to string
            branch_name=message.branch_name,
            llm_model=message.llm_model or "gpt-3.5-turbo"
        )
        
        ai_db_message = conversation_service.add_message(db, conversation_id, ai_message, current_user.id)
        return MessageResponse(
            id=str(ai_db_message.id),
            content=ai_db_message.content,
            role=ai_db_message.role,
            parent_id=str(ai_db_message.parent_id) if ai_db_message.parent_id else None,
            branch_name=ai_db_message.branch_name,
            llm_model=ai_db_message.llm_model,
            created_at=ai_db_message.created_at
        )
    
    return MessageResponse(
        id=str(db_message.id),
        content=db_message.content,
        role=db_message.role,
        parent_id=str(db_message.parent_id) if db_message.parent_id else None,
        branch_name=db_message.branch_name,
        llm_model=db_message.llm_model,
        created_at=db_message.created_at
    )

@app.post("/conversations/{conversation_id}/branch", response_model=BranchResponse)
async def create_branch(
    conversation_id: str,
    branch: BranchCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new branch from a specific message"""
    # Validate conversation belongs to user
    conversation = conversation_service.get_conversation(db, conversation_id, current_user.id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    db_branch = conversation_service.create_branch(db, conversation_id, branch, current_user.id)
    return BranchResponse(
        id=str(db_branch.id),
        name=db_branch.name,
        created_from_message_id=str(db_branch.created_from_message_id),
        created_at=db_branch.created_at,
        color=db_branch.color
    )

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
    
    context = conversation_service.get_message_context(db, message_id, current_user.id)
    return {"context": context}

@app.get("/conversations/{conversation_id}/branches")
async def get_branches(
    conversation_id: str,
    db: Session = Depends(get_db)
):
    """Get all branches in a conversation"""
    branches = conversation_service.get_branches(db, conversation_id)
    return {"branches": branches}

@app.get("/conversations/{conversation_id}/debug")
async def debug_conversation(
    conversation_id: str,
    db: Session = Depends(get_db)
):
    """Debug conversation integrity issues"""
    diagnostics = conversation_service.validate_conversation_integrity(db, conversation_id)
    return diagnostics

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
    
    # Update all messages in the branch
    messages = db.query(Message).filter(
        Message.conversation_id == conversation_id,
        Message.branch_name == branch_name
    ).all()
    
    if not messages:
        raise HTTPException(status_code=404, detail="Branch not found")
    
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
    """Delete a branch and all its messages"""
    # Check if conversation exists and belongs to user
    conversation = conversation_service.get_conversation(db, conversation_id, current_user.id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # Cannot delete main branch
    if branch_name == "main":
        raise HTTPException(status_code=400, detail="Cannot delete main branch")
    
    # Delete all messages in the branch
    messages = db.query(Message).filter(
        Message.conversation_id == conversation_id,
        Message.branch_name == branch_name
    ).all()
    
    if not messages:
        raise HTTPException(status_code=404, detail="Branch not found")
    
    for message in messages:
        db.delete(message)
    
    # Delete the branch record
    branch_record = db.query(Branch).filter(
        Branch.conversation_id == conversation_id,
        Branch.name == branch_name
    ).first()
    
    if branch_record:
        db.delete(branch_record)
    
    db.commit()
    
    return {"message": "Branch deleted successfully", "branch_name": branch_name}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
