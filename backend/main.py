from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
import uuid
from datetime import datetime

from app.database import get_db, engine
from app.models import Base, Conversation, Message, Branch
from app.schemas import (
    ConversationCreate, ConversationResponse, 
    MessageCreate, MessageResponse,
    BranchCreate, BranchResponse,
    ConversationTree
)
from app.services import ConversationService, LLMService

# Create tables
Base.metadata.create_all(bind=engine)

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

@app.get("/")
async def root():
    return {"message": "ChatBranch API is running"}

@app.post("/conversations", response_model=ConversationResponse)
async def create_conversation(
    conversation: ConversationCreate,
    db: Session = Depends(get_db)
):
    """Create a new conversation"""
    db_conversation = conversation_service.create_conversation(db, conversation)
    return db_conversation

@app.get("/conversations", response_model=List[ConversationResponse])
async def list_conversations(
    db: Session = Depends(get_db)
):
    """Get all conversations"""
    conversations = conversation_service.list_conversations(db)
    return [ConversationResponse.from_orm(conv) for conv in conversations]

@app.get("/conversations/{conversation_id}", response_model=ConversationTree)
async def get_conversation(
    conversation_id: str,
    db: Session = Depends(get_db)
):
    """Get conversation with full tree structure"""
    conversation = conversation_service.get_conversation(db, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    tree = conversation_service.build_conversation_tree(db, conversation_id)
    return tree

@app.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    db: Session = Depends(get_db)
):
    """Delete a conversation and all its messages and branches"""
    conversation = conversation_service.get_conversation(db, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    conversation_service.delete_conversation(db, conversation_id)
    return {"message": "Conversation deleted successfully"}

@app.post("/conversations/{conversation_id}/messages", response_model=MessageResponse)
async def add_message(
    conversation_id: str,
    message: MessageCreate,
    db: Session = Depends(get_db)
):
    """Add a message to a conversation"""
    # Check if conversation exists
    conversation = conversation_service.get_conversation(db, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # Add user message
    db_message = conversation_service.add_message(db, conversation_id, message)
    
    # Generate AI response if user message
    if message.role == "user":
        # Get context for AI
        context = conversation_service.get_message_context(db, db_message.id)
        
        # Generate AI response
        ai_response = await llm_service.generate_response(
            context, 
            model=message.llm_model or "gpt-3.5-turbo"
        )
        
        # Save AI response
        ai_message = MessageCreate(
            content=ai_response,
            role="assistant",
            parent_id=db_message.id,
            branch_name=message.branch_name,
            llm_model=message.llm_model or "gpt-3.5-turbo"
        )
        
        ai_db_message = conversation_service.add_message(db, conversation_id, ai_message)
        return ai_db_message
    
    return db_message

@app.post("/conversations/{conversation_id}/branch", response_model=BranchResponse)
async def create_branch(
    conversation_id: str,
    branch: BranchCreate,
    db: Session = Depends(get_db)
):
    """Create a new branch from a specific message"""
    db_branch = conversation_service.create_branch(db, conversation_id, branch)
    return db_branch

@app.get("/conversations/{conversation_id}/context/{message_id}")
async def get_message_context(
    conversation_id: str,
    message_id: str,
    db: Session = Depends(get_db)
):
    """Get the context chain leading to a specific message"""
    context = conversation_service.get_message_context(db, message_id)
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
