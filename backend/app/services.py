from sqlalchemy.orm import Session
from typing import List, Dict, Optional
import uuid
from datetime import datetime

from .models import Conversation, Message, Branch
from .schemas import ConversationCreate, MessageCreate, BranchCreate, ConversationTree, MessageNode, ConversationResponse, BranchResponse

class ConversationService:
    
    def create_conversation(self, db: Session, conversation: ConversationCreate) -> Conversation:
        """Create a new conversation"""
        db_conversation = Conversation(
            title=conversation.title,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(db_conversation)
        db.commit()
        db.refresh(db_conversation)
        return db_conversation
    
    def get_conversation(self, db: Session, conversation_id: str) -> Optional[Conversation]:
        """Get conversation by ID"""
        return db.query(Conversation).filter(Conversation.id == conversation_id).first()
    
    def add_message(self, db: Session, conversation_id: str, message: MessageCreate) -> Message:
        """Add a message to a conversation"""
        db_message = Message(
            conversation_id=conversation_id,
            content=message.content,
            role=message.role,
            parent_id=message.parent_id,
            branch_name=message.branch_name or "main",
            llm_model=message.llm_model,
            created_at=datetime.utcnow()
        )
        db.add(db_message)
        db.commit()
        db.refresh(db_message)
        return db_message
    
    def get_message_context(self, db: Session, message_id: str) -> List[Dict]:
        """Get the context chain leading to a message (for LLM)"""
        context = []
        current_message = db.query(Message).filter(Message.id == message_id).first()
        
        # Traverse up the tree to build context
        messages_chain = []
        while current_message:
            messages_chain.append(current_message)
            if current_message.parent_id:
                current_message = db.query(Message).filter(Message.id == current_message.parent_id).first()
            else:
                break
        
        # Reverse to get chronological order
        messages_chain.reverse()
        
        # Convert to LLM format
        for msg in messages_chain:
            context.append({
                "role": msg.role,
                "content": msg.content
            })
        
        return context
    
    def create_branch(self, db: Session, conversation_id: str, branch: BranchCreate) -> Branch:
        """Create a new branch from a message"""
        db_branch = Branch(
            conversation_id=conversation_id,
            name=branch.name,
            created_from_message_id=branch.created_from_message_id,
            color=branch.color,
            created_at=datetime.utcnow()
        )
        db.add(db_branch)
        db.commit()
        db.refresh(db_branch)
        return db_branch
    
    def get_branches(self, db: Session, conversation_id: str) -> List[Branch]:
        """Get all branches in a conversation"""
        return db.query(Branch).filter(Branch.conversation_id == conversation_id).all()
    
    def build_conversation_tree(self, db: Session, conversation_id: str) -> ConversationTree:
        """Build the complete conversation tree structure"""
        conversation = self.get_conversation(db, conversation_id)
        if not conversation:
            raise ValueError("Conversation not found")
        
        # Get all messages
        messages = db.query(Message).filter(Message.conversation_id == conversation_id).all()
        
        # Build message nodes dictionary
        message_nodes = {}
        for msg in messages:
            message_nodes[str(msg.id)] = MessageNode(
                id=msg.id,
                content=msg.content,
                role=msg.role,
                branch_name=msg.branch_name,
                llm_model=msg.llm_model,
                created_at=msg.created_at,
                children=[]
            )
        
        # Build parent-child relationships
        root_messages = []
        for msg in messages:
            if msg.parent_id:
                parent_node = message_nodes.get(str(msg.parent_id))
                if parent_node:
                    parent_node.children.append(message_nodes[str(msg.id)])
            else:
                root_messages.append(msg.id)
        
        # Get branches
        branches = self.get_branches(db, conversation_id)
        branch_responses = [BranchResponse.from_orm(branch) for branch in branches]
        
        return ConversationTree(
            conversation=ConversationResponse.from_orm(conversation),
            messages=message_nodes,
            branches=branch_responses,
            root_messages=root_messages
        )


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
        
        # Use dummy responses by default or if real LLM is not configured
        if self.use_dummy_responses or not self._can_use_real_llm():
            return await self._generate_dummy_response(context, model)
        else:
            return await self._generate_real_response(context, model)
    
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
