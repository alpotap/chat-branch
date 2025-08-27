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
from app.models import Base, Conversation, Message, Branch, User
from app.schemas import (
    ConversationCreate, ConversationResponse, 
    MessageCreate, MessageResponse,
    BranchCreate, BranchResponse,
    ConversationTree, UserLogin, UserResponse, Token, LoginResponse
)
from app.services import ConversationService, LLMService, AuthService
from app.auth import verify_token
import litellm

# Enable verbose logging for LiteLLM
litellm.set_verbose = True

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
        ai_response_content = await llm_service.generate_response(
            context,
            model=message.llm_model
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
        
        llm_model = original_ai_message.llm_model if original_ai_message else "gpt-3.5-turbo"
        
        # Generate AI response
        ai_response = await llm_service.generate_response(context, llm_model)
        
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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Regenerate an AI message in place by deleting the old one"""
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
            llm_model
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
    request: dict, # Expects {"content": "new content"}
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Edit a user message in-place, only if it is a leaf node."""
    new_content = request.get("content")
    if not new_content:
        raise HTTPException(status_code=400, detail="New content not provided.")
    try:
        updated_message = conversation_service.edit_message_in_place(
            db, conversation_id, message_id, new_content, current_user.id
        )
        return MessageResponse.from_orm(updated_message)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/conversations/{conversation_id}/messages/{message_id}/edit-as-branch", response_model=MessageResponse)
async def edit_message_as_branch(
    conversation_id: str,
    message_id: str,
    request: dict, # Expects {"content": "new content"}
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

        ai_response_content = await llm_service.generate_response(context, model=new_message_create.llm_model)
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

        return {"success": True, "result": result}

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
