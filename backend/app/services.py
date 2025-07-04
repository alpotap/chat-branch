from sqlalchemy.orm import Session
from typing import List, Dict, Optional
import uuid
import os
import random
import asyncio
from datetime import datetime

from .models import Conversation, Message, Branch, User
from .schemas import ConversationCreate, MessageCreate, BranchCreate, ConversationTree, MessageNode, ConversationResponse, BranchResponse, UserResponse, Token
from .auth import verify_password, get_password_hash, create_access_token

class ConversationService:
    
    def create_conversation(self, db: Session, conversation: ConversationCreate, user_id: str) -> Conversation:
        """Create a new conversation for a specific user"""
        db_conversation = Conversation(
            title=conversation.title,
            user_id=user_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(db_conversation)
        db.commit()
        db.refresh(db_conversation)
        return db_conversation
    
    def get_conversation(self, db: Session, conversation_id: str, user_id: str) -> Optional[Conversation]:
        """Get conversation by ID for a specific user"""
        return db.query(Conversation).filter(
            Conversation.id == conversation_id,
            Conversation.user_id == user_id
        ).first()
    
    def list_conversations(self, db: Session, user_id: str) -> List[Conversation]:
        """Get all conversations for a specific user ordered by creation date (newest first)"""
        return db.query(Conversation).filter(
            Conversation.user_id == user_id
        ).order_by(Conversation.created_at.desc()).all()
    
    def delete_conversation(self, db: Session, conversation_id: str, user_id: str) -> bool:
        """Delete a conversation and all its related data"""
        conversation = self.get_conversation(db, conversation_id, user_id)
        if not conversation:
            return False
        
        try:
            # Important: Delete in correct order to avoid foreign key violations
            
            # 1. First delete all branches (they reference messages)
            branches_deleted = db.query(Branch).filter(Branch.conversation_id == conversation_id).delete()
            print(f"🗑️ Deleted {branches_deleted} branches")
            
            # 2. Then delete all messages (they reference other messages via parent_id)
            messages_deleted = db.query(Message).filter(Message.conversation_id == conversation_id).delete()
            print(f"🗑️ Deleted {messages_deleted} messages")
            
            # 3. Finally delete the conversation itself
            db.delete(conversation)
            
            # Commit all changes
            db.commit()
            print(f"✅ Successfully deleted conversation {conversation_id}")
            return True
            
        except Exception as e:
            print(f"❌ Error deleting conversation {conversation_id}: {e}")
            db.rollback()
            raise e
    
    def add_message(self, db: Session, conversation_id: str, message: MessageCreate, user_id: str) -> Message:
        """Add a message to a conversation"""
        
        # Validate conversation exists and belongs to user
        conversation = self.get_conversation(db, conversation_id, user_id)
        if not conversation:
            raise ValueError(f"Conversation {conversation_id} not found or does not belong to user")
        
        # Validate parent message if specified
        if message.parent_id:
            parent_message = db.query(Message).filter(
                Message.id == message.parent_id,
                Message.conversation_id == conversation_id  # Ensure parent is in same conversation
            ).first()
            if not parent_message:
                print(f"⚠️  Invalid parent_id {message.parent_id} for conversation {conversation_id}")
                # Rather than failing, we'll set parent_id to None
                message.parent_id = None
        
        db_message = Message(
            conversation_id=conversation_id,
            content=message.content,
            role=message.role,
            parent_id=message.parent_id,
            branch_name=message.branch_name or "main",
            llm_model=message.llm_model,
            user_id=user_id,
            created_at=datetime.utcnow()
        )
        
        print(f"💬 Adding message to conversation {conversation_id}: {message.role} in branch '{message.branch_name or 'main'}'")
        
        db.add(db_message)
        db.commit()
        db.refresh(db_message)
        return db_message
    
    def get_message_context(self, db: Session, conversation_id: str, branch_name: str, user_id: str, parent_message_id: Optional[str] = None) -> List[Dict]:
        """Get the conversation context for LLM - builds proper branch history"""
        
        # Get all messages in the conversation for this user
        all_messages = db.query(Message).filter(
            Message.conversation_id == conversation_id,
            Message.user_id == user_id,
            Message.is_active == True
        ).order_by(Message.created_at).all()
        
        if not all_messages:
            return []
        
        # Get all messages in the current branch (chronological order)
        branch_messages = [msg for msg in all_messages if msg.branch_name == branch_name]
        
        if not branch_messages:
            return []
        
        # Build the conversation thread for this branch
        # Find the branch point (where this branch started)
        branch_point_msg_id = None
        branches = db.query(Branch).filter(
            Branch.conversation_id == conversation_id,
            Branch.name == branch_name
        ).first()
        
        if branches and branches.created_from_message_id:
            branch_point_msg_id = branches.created_from_message_id
        
        context_messages = []
        
        if branch_point_msg_id and branch_name != "main":
            # For non-main branches: get all main branch messages up to branch point, then add branch messages
            message_dict = {msg.id: msg for msg in all_messages}
            
            # Get all main branch messages
            main_messages = [msg for msg in all_messages if msg.branch_name == "main"]
            main_messages_sorted = sorted(main_messages, key=lambda x: x.created_at)
            
            # Find the branch point in the main messages
            branch_point_index = -1
            for i, msg in enumerate(main_messages_sorted):
                if msg.id == branch_point_msg_id:
                    branch_point_index = i
                    break
            
            # Include all main messages up to and including the branch point
            if branch_point_index >= 0:
                context_messages = main_messages_sorted[:branch_point_index + 1]
            else:
                context_messages = []
            
            # Then add all messages in the current branch (excluding the branch point message)
            branch_only_messages = [msg for msg in branch_messages if msg.id != branch_point_msg_id]
            context_messages.extend(sorted(branch_only_messages, key=lambda x: x.created_at))
            
        else:
            # For main branch or when no branch point: use all messages in chronological order
            context_messages = sorted(branch_messages, key=lambda x: x.created_at)
        
        # Convert to standard LLM message format
        llm_context = []
        for msg in context_messages:
            llm_context.append({
                "role": msg.role,  # "user" or "assistant" 
                "content": msg.content
            })
        
        return llm_context
    
    def _build_conversation_thread(self, branch_messages: List[Message], start_message: Message) -> List[Message]:
        """Build a chronological conversation thread starting from a message"""
        thread = [start_message]
        message_dict = {msg.id: msg for msg in branch_messages}
        
        # Find children of the start message and continue the thread
        current_id = start_message.id
        while True:
            # Find the next message in the thread (child of current message)
            next_message = None
            for msg in branch_messages:
                if msg.parent_id == current_id:
                    next_message = msg
                    break
            
            if next_message:
                thread.append(next_message)
                current_id = next_message.id
            else:
                break
        
        return thread
    
    def create_branch(self, db: Session, conversation_id: str, branch: BranchCreate, user_id: str) -> Branch:
        """Create a new branch from a message"""
        # Validate conversation belongs to user
        conversation = self.get_conversation(db, conversation_id, user_id)
        if not conversation:
            raise ValueError(f"Conversation {conversation_id} not found or does not belong to user")
        
        db_branch = Branch(
            conversation_id=conversation_id,
            name=branch.name,
            created_from_message_id=branch.created_from_message_id,
            color=branch.color,
            user_id=user_id,
            created_at=datetime.utcnow()
        )
        db.add(db_branch)
        db.commit()
        db.refresh(db_branch)
        return db_branch
    
    def get_branches(self, db: Session, conversation_id: str, user_id: str) -> List[Branch]:
        """Get all branches in a conversation"""
        # Validate conversation belongs to user
        conversation = self.get_conversation(db, conversation_id, user_id)
        if not conversation:
            return []
        
        return db.query(Branch).filter(
            Branch.conversation_id == conversation_id,
            Branch.user_id == user_id
        ).all()
    
    def build_conversation_tree(self, db: Session, conversation_id: str, user_id: str) -> ConversationTree:
        """Build the complete conversation tree structure"""
        conversation = self.get_conversation(db, conversation_id, user_id)
        if not conversation:
            raise ValueError("Conversation not found or does not belong to user")
        
        # Get all messages for this specific conversation and user
        messages = db.query(Message).filter(
            Message.conversation_id == conversation_id,
            Message.user_id == user_id
        ).all()
        
        # Debug logging
        print(f"🔍 Building tree for conversation {conversation_id}")
        print(f"📊 Found {len(messages)} messages")
        
        # Build message nodes dictionary
        message_nodes = {}
        for msg in messages:
            message_nodes[str(msg.id)] = MessageNode(
                id=str(msg.id),  # Convert to string
                content=msg.content,
                role=msg.role,
                branch_name=msg.branch_name,
                llm_model=msg.llm_model,
                created_at=msg.created_at,
                children=[]
            )
        
        # Build parent-child relationships with validation
        root_messages = []
        orphaned_messages = []
        
        for msg in messages:
            if msg.parent_id:
                parent_node = message_nodes.get(str(msg.parent_id))
                if parent_node:
                    parent_node.children.append(message_nodes[str(msg.id)])
                else:
                    # Parent ID references a message that doesn't exist or is in a different conversation
                    print(f"⚠️  Message {msg.id} has invalid parent_id {msg.parent_id}")
                    orphaned_messages.append(str(msg.id))
                    # Treat as root message for now
                    root_messages.append(str(msg.id))
            else:
                root_messages.append(str(msg.id))
        
        # Debug output
        print(f"🌱 Root messages: {len(root_messages)}")
        print(f"🔗 Orphaned messages: {len(orphaned_messages)}")
        
        # Get branches
        branches = self.get_branches(db, conversation_id, user_id)
        branch_responses = [
            BranchResponse(
                id=str(branch.id),
                name=branch.name,
                created_from_message_id=str(branch.created_from_message_id),
                created_at=branch.created_at,
                color=branch.color
            ) 
            for branch in branches
        ]
        
        print(f"🌿 Branches: {len(branches)}")
        
        return ConversationTree(
            conversation=ConversationResponse(
                id=str(conversation.id),
                title=conversation.title,
                created_at=conversation.created_at,
                updated_at=conversation.updated_at
            ),
            messages=message_nodes,
            branches=branch_responses,
            root_messages=[msg_id for msg_id in root_messages]  # Already strings
        )
    
    def validate_conversation_integrity(self, db: Session, conversation_id: str, user_id: str) -> Dict:
        """Validate conversation integrity and return diagnostic information"""
        conversation = self.get_conversation(db, conversation_id, user_id)
        if not conversation:
            return {"error": "Conversation not found or does not belong to user"}
        
        # Get all messages
        messages = db.query(Message).filter(
            Message.conversation_id == conversation_id,
            Message.user_id == user_id
        ).all()
        
        diagnostics = {
            "conversation_id": conversation_id,
            "total_messages": len(messages),
            "message_details": [],
            "orphaned_messages": [],
            "invalid_parent_refs": [],
            "branches": {},
            "root_messages": []
        }
        
        # Check each message
        message_ids = {str(msg.id) for msg in messages}
        
        for msg in messages:
            msg_info = {
                "id": str(msg.id),
                "role": msg.role,
                "branch_name": msg.branch_name,
                "parent_id": str(msg.parent_id) if msg.parent_id else None,
                "has_valid_parent": True,
                "content_preview": msg.content[:50] + "..." if len(msg.content) > 50 else msg.content
            }
            
            # Check parent validity
            if msg.parent_id:
                if str(msg.parent_id) not in message_ids:
                    msg_info["has_valid_parent"] = False
                    diagnostics["invalid_parent_refs"].append(msg_info)
            else:
                diagnostics["root_messages"].append(str(msg.id))
            
            # Group by branch
            if msg.branch_name not in diagnostics["branches"]:
                diagnostics["branches"][msg.branch_name] = []
            diagnostics["branches"][msg.branch_name].append(str(msg.id))
            
            diagnostics["message_details"].append(msg_info)
        
        # Find orphaned messages (messages that should have parents but don't)
        for msg in messages:
            if not msg.parent_id and msg.role == 'assistant':
                # Assistant messages should usually have parent user messages
                # (except for initial assistant messages in some edge cases)
                diagnostics["orphaned_messages"].append({
                    "id": str(msg.id),
                    "role": msg.role,
                    "branch_name": msg.branch_name,
                    "reason": "Assistant message without parent"
                })
        
        return diagnostics

    def fix_conversation_integrity(self, db: Session, conversation_id: str, user_id: str) -> Dict:
        """Attempt to fix common conversation integrity issues"""
        diagnostics = self.validate_conversation_integrity(db, conversation_id, user_id)
        
        fixes_applied = []
        
        # Fix 1: Remove messages with invalid parent references
        if diagnostics["invalid_parent_refs"]:
            for invalid_msg in diagnostics["invalid_parent_refs"]:
                # Option 1: Set parent_id to null (make it a root message)
                # Option 2: Delete the message (more aggressive)
                # For now, we'll set parent_id to null
                db.query(Message).filter(Message.id == invalid_msg["id"]).update({"parent_id": None})
                fixes_applied.append(f"Fixed invalid parent ref for message {invalid_msg['id']}")
        
        if fixes_applied:
            db.commit()
        
        return {
            "fixes_applied": fixes_applied,
            "diagnostics_after_fix": self.validate_conversation_integrity(db, conversation_id)
        }


import random
import asyncio
import os
from typing import List, Dict
from dotenv import load_dotenv

# Try to import litellm, but don't fail if it's not available
try:
    import litellm
    LITELLM_AVAILABLE = True
except ImportError:
    LITELLM_AVAILABLE = False
    print("⚠️  LiteLLM not available, using dummy responses only")

load_dotenv()

class LLMService:
    """
    LLM Service for ChatBranch - supports both dummy responses and real LLM calls
    
    Configuration:
    - Set USE_DUMMY_RESPONSES=false in .env to enable real LLM calls
    - Add OPENAI_API_KEY and/or ANTHROPIC_API_KEY for real LLM access
    - Install optional dependencies: pip install litellm python-dotenv
    
    Message Format:
    - Uses standard OpenAI format: [{"role": "user/assistant", "content": "..."}]
    - Supports models: gpt-3.5-turbo, gpt-4, claude-3-sonnet-20240229, claude-3-haiku-20240307
    """
    
    def __init__(self):
        # Configuration - set USE_DUMMY_RESPONSES=false in .env to use real LLMs
        self.use_dummy_responses = os.getenv("USE_DUMMY_RESPONSES", "true").lower() == "true"
        
        # Set up API keys for real LLM calls
        if not self.use_dummy_responses and LITELLM_AVAILABLE:
            os.environ["OPENAI_API_KEY"] = os.getenv("OPENAI_API_KEY", "")
            os.environ["ANTHROPIC_API_KEY"] = os.getenv("ANTHROPIC_API_KEY", "")
        
        # Dummy responses for testing
        self.dummy_responses = [
            "That's an interesting question! Let me think about that...",
            "Based on what you've mentioned, I would say that this is a complex topic with several considerations.",
            "Here's my perspective on that: it really depends on the specific context and requirements you're working with.",
            "Great point! This reminds me of similar patterns I've seen in other domains.",
            "I understand what you're asking. Let me break this down into a few key points:",
            "That's a thoughtful question that touches on several important concepts.",
            "From a technical standpoint, there are multiple approaches you could consider.",
            "This is definitely something worth exploring further. Here are some thoughts:",
            "You're absolutely right to think about this carefully. The implications are quite significant.",
            "This is a fascinating topic! There are several angles we could explore here."
        ]
        
        self.follow_up_responses = [
            "Building on that previous point, it's also worth considering the scalability aspects.",
            "Another important factor to keep in mind is how this interacts with existing systems.",
            "The performance implications of this approach are definitely worth discussing.",
            "From a user experience perspective, this could have some interesting benefits.",
            "Security considerations are also important when implementing something like this.",
            "The maintenance overhead is something to factor into your decision-making process.",
            "Documentation and knowledge transfer become crucial with this type of implementation.",
            "Testing strategies for this kind of system require some special considerations.",
            "The learning curve for team members is another aspect to think about.",
            "Long-term sustainability and evolution of the solution should also be considered."
        ]
    
    async def generate_response(self, context: List[Dict], model: str = "gpt-3.5-turbo") -> str:
        """Generate AI response - either dummy or real based on configuration"""
        
        # Validate context format
        if not self._validate_context(context):
            raise ValueError("Invalid context format. Expected list of dicts with 'role' and 'content' keys.")
        
        # Debug: Log the context being sent to LLM
        print(f"\n🤖 LLM Request for model '{model}':")
        print(f"📝 Context length: {len(context)} messages")
        for i, msg in enumerate(context):
            role = msg.get('role', 'unknown')
            content = msg.get('content', '')[:100] + ('...' if len(msg.get('content', '')) > 100 else '')
            print(f"   {i+1}. {role}: {content}")
        print("=" * 50)
        
        # Use dummy responses by default or if real LLM is not configured
        if self.use_dummy_responses or not self._can_use_real_llm():
            return await self._generate_dummy_response(context, model)
        else:
            return await self._generate_real_response(context, model)
    
    def _validate_context(self, context: List[Dict]) -> bool:
        """Validate that context is in proper LLM message format"""
        if not isinstance(context, list):
            return False
        
        for msg in context:
            if not isinstance(msg, dict):
                return False
            if 'role' not in msg or 'content' not in msg:
                return False
            if msg['role'] not in ['user', 'assistant', 'system']:
                return False
            if not isinstance(msg['content'], str):
                return False
        
        return True
    
    def _can_use_real_llm(self) -> bool:
        """Check if real LLM calls are possible"""
        if not LITELLM_AVAILABLE:
            return False
        
        # Check if we have at least one API key
        has_openai = bool(os.getenv("OPENAI_API_KEY"))
        has_anthropic = bool(os.getenv("ANTHROPIC_API_KEY"))
        
        return has_openai or has_anthropic
    
    async def _generate_real_response(self, context: List[Dict], model: str) -> str:
        """Generate real AI response using LiteLLM"""
        try:
            response = await litellm.acompletion(
                model=model,
                messages=context,
                temperature=0.7,
                max_tokens=1000
            )
            return response.choices[0].message.content
            
        except Exception as e:
            print(f"❌ Error with real LLM call: {e}")
            # Fallback to dummy response if real LLM fails
            return await self._generate_dummy_response(context, model, error_fallback=True)
    
    async def _generate_dummy_response(self, context: List[Dict], model: str, error_fallback: bool = False) -> str:
        """Generate dummy AI response for testing"""
        
        # Simulate API call delay
        await self._simulate_api_delay(model)
        
        # Get last user message for context-aware response
        last_message = ""
        for msg in reversed(context):
            if msg.get("role") == "user":
                last_message = msg.get("content", "")
                break
        
        # Choose response based on conversation length
        conversation_length = len([msg for msg in context if msg.get("role") == "user"])
        
        if conversation_length <= 1:
            # First response
            base_response = random.choice(self.dummy_responses)
        else:
            # Follow-up response
            base_response = random.choice(self.follow_up_responses)
        
        # Add model-specific formatting
        response = self._format_response_for_model(base_response, model, last_message, error_fallback)
        
        return response
    
    async def _simulate_api_delay(self, model: str):
        """Simulate realistic API response times"""
        delays = {
            "gpt-3.5-turbo": (0.5, 1.5),
            "gpt-4": (2.0, 4.0),
            "claude-3-sonnet-20240229": (1.0, 2.5),
            "claude-3-haiku-20240307": (0.3, 1.0),
        }
        
        min_delay, max_delay = delays.get(model, (0.5, 2.0))
        delay = random.uniform(min_delay, max_delay)
        
        # Simulate with a short delay for testing
        await asyncio.sleep(min(delay, 0.5))  # Cap at 0.5s for testing
    
    def _format_response_for_model(self, base_response: str, model: str, last_message: str, error_fallback: bool = False) -> str:
        """Format response to simulate different model styles"""
        
        # Add appropriate prefix
        if error_fallback:
            model_prefix = f"[FALLBACK-DEMO {model}] "
        elif self.use_dummy_responses:
            model_prefix = f"[DEMO {model}] "
        else:
            model_prefix = ""  # No prefix for real responses
        
        # Add some context awareness
        if last_message:
            if "?" in last_message:
                base_response = f"You asked about {last_message[:30]}... {base_response}"
            elif any(word in last_message.lower() for word in ["hello", "hi", "hey"]):
                base_response = "Hello! " + base_response
            elif any(word in last_message.lower() for word in ["thank", "thanks"]):
                base_response = "You're welcome! " + base_response
        
        # Simulate different model characteristics
        if "gpt-4" in model:
            base_response += "\n\nI should note that this is a comprehensive topic with many nuances to consider."
        elif "claude" in model:
            base_response += "\n\nI hope this helps clarify things for you!"
        elif "haiku" in model:
            # Shorter response for haiku
            base_response = base_response[:100] + "..."
        
        return model_prefix + base_response

class AuthService:
    
    def authenticate_user(self, db: Session, email: str, password: str) -> Optional[User]:
        """Authenticate a user with email and password"""
        print(f"🔐 Attempting to authenticate user: {email}")
        
        user = db.query(User).filter(User.email == email).first()
        if not user:
            print(f"❌ User {email} not found")
            return None
            
        print(f"✅ User {email} found, checking password...")
        
        # Import verify_password here to avoid import issues
        from .auth import verify_password
        
        if not verify_password(password, user.password_hash):
            print(f"❌ Password verification failed for {email}")
            return None
            
        print(f"✅ Password verified for {email}")
        return user
    
    def get_user_by_id(self, db: Session, user_id: str) -> Optional[User]:
        """Get user by ID"""
        try:
            return db.query(User).filter(User.id == user_id).first()
        except:
            return None
    
    def get_user_by_email(self, db: Session, email: str) -> Optional[User]:
        """Get user by email"""
        return db.query(User).filter(User.email == email).first()
    
    def create_access_token_for_user(self, user: User) -> Token:
        """Create access token for authenticated user"""
        access_token = create_access_token(
            data={"sub": str(user.id), "email": user.email, "role": user.role}
        )
        return Token(
            access_token=access_token,
            token_type="bearer",
            expires_in=7 * 24 * 60 * 60  # 7 days in seconds
        )
