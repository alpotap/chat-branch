from sqlalchemy.orm import Session
from typing import List, Dict, Optional, Any
import uuid
import os
import random
import asyncio
from datetime import datetime, timezone
import random
import asyncio
import os
from dotenv import load_dotenv
import aiohttp
from openrouter import OpenRouter

load_dotenv()

from .models import Conversation, Message, Branch, User
from .schemas import ConversationCreate, MessageCreate, BranchCreate, ConversationTree, MessageNode, ConversationResponse, BranchResponse, UserResponse, Token
from .auth import verify_password, get_password_hash, create_access_token

class ConversationService:
    
    def create_conversation(self, db: Session, conversation: ConversationCreate, user_id: str) -> Conversation:
        """Create a new conversation for a specific user"""
        db_conversation = Conversation(
            title=conversation.title,
            user_id=user_id,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
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
    
    def add_user_and_ai_messages_transactional(self, db: Session, conversation_id: str, user_message: MessageCreate, ai_response_content: str, user_id: str) -> Message:
        """
        Adds a user message and an AI response to the database in a single transaction.
        This is the robust way to ensure that user messages are not saved if the AI fails.
        """
        # 1. Create user message object
        db_user_message = Message(
            conversation_id=conversation_id,
            content=user_message.content,
            role='user',
            parent_id=user_message.parent_id,
            branch_name=user_message.branch_name or "main",
            llm_model=user_message.llm_model,
            user_id=user_id,
            created_at=datetime.now(timezone.utc)
        )
        db.add(db_user_message)
        # We need to flush to get the ID for the parent_id of the AI message
        db.flush()

        # 2. Create AI message object
        db_ai_message = Message(
            conversation_id=conversation_id,
            content=ai_response_content,
            role='assistant',
            parent_id=db_user_message.id,
            branch_name=user_message.branch_name or "main",
            llm_model=user_message.llm_model,
            user_id=user_id,
            created_at=datetime.now(timezone.utc)
        )
        db.add(db_ai_message)
        
        # 3. Commit the transaction
        db.commit()
        
        # 4. Refresh the AI message to get all DB-defaults
        db.refresh(db_ai_message)
        
        return db_ai_message

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
            created_at=datetime.now(timezone.utc)
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
    
    def edit_message_in_place(self, db: Session, conversation_id: str, message_id: str, new_content: str, user_id: str) -> Message:
        """Edits a message in-place, with safety checks."""
        message = db.query(Message).filter(
            Message.id == message_id,
            Message.conversation_id == conversation_id,
            Message.user_id == user_id
        ).first()

        if not message:
            raise ValueError("Message not found or access denied.")

        child_count = db.query(Message).filter(Message.parent_id == message_id).count()
        if child_count > 0:
            raise ValueError("Cannot edit a message in-place that has replies.")

        message.content = new_content
        db.commit()
        db.refresh(message)
        return message

    def edit_message_as_branch(self, db: Session, conversation_id: str, original_message_id: str, user_id: str) -> dict:
        """
        Creates a new branch from the parent of the original message.
        Returns the necessary info to create the new message (parent_id, branch_name, model).
        """
        original_message = db.query(Message).filter(Message.id == original_message_id, Message.user_id == user_id).first()
        if not original_message:
            raise ValueError("Original message not found or access denied.")
        if not original_message.parent_id:
            raise ValueError("Cannot create a branch-edit from the first message.")

        branch_point_message_id = original_message.parent_id
        base_name = f"edit-{original_message.branch_name}"
        new_branch_name = self.generate_unique_branch_name(db, conversation_id, base_name, user_id)

        branch_data = BranchCreate(name=new_branch_name, created_from_message_id=str(branch_point_message_id), color="#FFC107") # Amber color for edits
        self.create_branch(db, conversation_id, branch_data, user_id)

        return {
            "parent_id": str(branch_point_message_id),
            "branch_name": new_branch_name,
            "llm_model": original_message.llm_model
        }
    
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
    
    def check_branch_name_exists(self, db: Session, conversation_id: str, branch_name: str, user_id: str) -> bool:
        """Check if a branch name already exists in the conversation"""
        existing_branch = db.query(Branch).filter(
            Branch.conversation_id == conversation_id,
            Branch.name == branch_name,
            Branch.user_id == user_id
        ).first()
        
        # Also check if it's a branch_name used in messages (like "main")
        existing_message = db.query(Message).filter(
            Message.conversation_id == conversation_id,
            Message.branch_name == branch_name,
            Message.user_id == user_id
        ).first()
        
        return existing_branch is not None or existing_message is not None
    
    def generate_unique_branch_name(self, db: Session, conversation_id: str, base_name: str, user_id: str) -> str:
        """Generate a unique branch name by appending numbers if needed"""
        if not self.check_branch_name_exists(db, conversation_id, base_name, user_id):
            return base_name
        
        counter = 2
        while True:
            candidate_name = f"{base_name}-{counter}"
            if not self.check_branch_name_exists(db, conversation_id, candidate_name, user_id):
                return candidate_name
            counter += 1
    
    def create_branch(self, db: Session, conversation_id: str, branch: BranchCreate, user_id: str) -> Branch:
        """Create a new branch from a message"""
        # Validate conversation belongs to user
        conversation = self.get_conversation(db, conversation_id, user_id)
        if not conversation:
            raise ValueError(f"Conversation {conversation_id} not found or does not belong to user")
        
        # Check if branch name already exists
        if self.check_branch_name_exists(db, conversation_id, branch.name, user_id):
            raise ValueError(f"Branch name '{branch.name}' already exists in this conversation. Please choose a different name.")
        
        db_branch = Branch(
            conversation_id=conversation_id,
            name=branch.name,
            created_from_message_id=branch.created_from_message_id,
            color=branch.color,
            user_id=user_id,
            created_at=datetime.now(timezone.utc)
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
            Branch.user_id == user_id,
            Branch.is_active == True
        ).all()
    
    def get_dependent_branches(self, db: Session, conversation_id: str, branch_name: str, user_id: str) -> List[str]:
        """
        Get all branches that depend on the given branch, including nested dependencies.
        """
        # Validate user has access to the conversation
        conversation = self.get_conversation(db, conversation_id, user_id)
        if not conversation:
            raise ValueError("Conversation not found or access denied.")

        all_dependent_branches = set()
        branches_to_check = [branch_name]
        
        checked_branches = set()

        while branches_to_check:
            current_branch = branches_to_check.pop(0)
            if current_branch in checked_branches:
                continue
            
            checked_branches.add(current_branch)

            # Get all message IDs from the current branch being checked
            message_ids_in_branch = [
                str(msg.id) for msg in db.query(Message.id).filter(
                    Message.conversation_id == conversation_id,
                    Message.branch_name == current_branch,
                    Message.user_id == user_id
                ).all()
            ]

            if not message_ids_in_branch:
                continue

            # Find branches created from messages in the current branch
            direct_dependents = db.query(Branch).filter(
                Branch.conversation_id == conversation_id,
                Branch.user_id == user_id,
                Branch.created_from_message_id.in_(message_ids_in_branch)
            ).all()

            for dependent_branch in direct_dependents:
                if dependent_branch.name not in all_dependent_branches:
                    all_dependent_branches.add(dependent_branch.name)
                    branches_to_check.append(dependent_branch.name)
        
        return list(all_dependent_branches)

    def delete_branch_with_cascading(self, db: Session, conversation_id: str, branch_name: str, user_id: str) -> List[str]:
        """
        Delete a branch and all its dependent branches, returning the names of all deleted branches.
        """
        if branch_name == "main":
            raise ValueError("The 'main' branch cannot be deleted.")

        # Get all dependent branches
        dependent_branches = self.get_dependent_branches(db, conversation_id, branch_name, user_id)
        
        branches_to_delete = [branch_name] + dependent_branches
        
        deleted_branch_names = []

        # Delete branches in reverse dependency order (dependents first, then parents)
        branches_to_delete.reverse()

        for b_name in branches_to_delete:
            # 1. Get all messages in this branch
            messages_in_branch = db.query(Message).filter(
                Message.conversation_id == conversation_id,
                Message.branch_name == b_name,
                Message.user_id == user_id
            ).all()
            
            # 2. For each message in this branch, remove any parent_id references from other messages
            for message in messages_in_branch:
                # Update any messages that reference this message as parent (set parent_id to None)
                db.query(Message).filter(
                    Message.parent_id == message.id
                ).update({"parent_id": None}, synchronize_session=False)
            
            # 3. Now delete all messages in this branch
            db.query(Message).filter(
                Message.conversation_id == conversation_id,
                Message.branch_name == b_name,
                Message.user_id == user_id
            ).delete(synchronize_session=False)
            
            # 4. Delete the branch record itself
            db.query(Branch).filter(
                Branch.conversation_id == conversation_id,
                Branch.name == b_name,
                Branch.user_id == user_id
            ).delete(synchronize_session=False)
            
            deleted_branch_names.append(b_name)

        db.commit()
        # Return in original order (parent branch first)
        deleted_branch_names.reverse()
        return deleted_branch_names

    def delete_branch(self, db: Session, conversation_id: str, branch_name: str, user_id: str) -> bool:
        """Delete a single branch and its messages."""
        if branch_name == "main":
            return False

        # Delete messages in the branch
        db.query(Message).filter(
            Message.conversation_id == conversation_id,
            Message.branch_name == branch_name,
            Message.user_id == user_id
        ).delete()

        # Delete the branch itself
        branch = db.query(Branch).filter(
            Branch.conversation_id == conversation_id,
            Branch.name == branch_name,
            Branch.user_id == user_id
        ).first()

        if branch:
            db.delete(branch)
            db.commit()
            return True
        
        # If no branch record (e.g., an empty branch that was never saved), still commit message deletion
        db.commit()
        return False
    
    def soft_delete_last_user_message(self, db: Session, conversation_id: str, message_id: str, user_id: str) -> Dict:
        """
        Soft-delete the specified user message if it's the last active message (no active children) in its branch.
        If the message is the only active message in its branch and the branch is not 'main', also soft-delete the branch.

        Returns a dict: {"message_id": str, "branch_name": str, "branch_deleted": bool}
        """
        # Fetch the target message and validate ownership/activity
        msg = db.query(Message).filter(
            Message.id == message_id,
            Message.conversation_id == conversation_id,
            Message.user_id == user_id,
            Message.is_active == True
        ).first()

        if not msg:
            raise ValueError("Message not found or already inactive")

        if msg.role != "user":
            raise ValueError("Only user messages can be deleted")

        # Determine branch name for later checks
        branch_name = msg.branch_name or "main"

        # Ensure the message has no active children (i.e., it's a leaf)
        active_children = db.query(Message).filter(
            Message.parent_id == message_id,
            Message.conversation_id == conversation_id,
            Message.user_id == user_id,
            Message.is_active == True
        ).all()

        # If there are active children, normally deletion is forbidden. However we allow
        # deleting the user message together with its immediate assistant response when
        # and only when that assistant child is the most recent active message in the branch
        # and that assistant has no active children of its own. This implements the
        # "delete last user-system pair" behavior.
        allow_delete_pair = False
        assistant_child = None
        if len(active_children) > 1:
            # More than one active child -> cannot safely delete
            raise ValueError("Cannot delete message that has follow-up responses. Only the most recent leaf message can be deleted.")
        elif len(active_children) == 1:
            child = active_children[0]
            # Only consider the special pair-case when the single child is an assistant reply
            if child.role == "assistant":
                # Ensure the assistant child itself has no active children
                child_active_children_count = db.query(Message).filter(
                    Message.parent_id == child.id,
                    Message.conversation_id == conversation_id,
                    Message.user_id == user_id,
                    Message.is_active == True
                ).count()
                if child_active_children_count == 0:
                    # Check that this assistant child is the most recent active message in the branch
                    latest_active_msg = db.query(Message).filter(
                        Message.conversation_id == conversation_id,
                        Message.branch_name == branch_name,
                        Message.user_id == user_id,
                        Message.is_active == True
                    ).order_by(Message.created_at.desc()).first()

                    if latest_active_msg and latest_active_msg.id == child.id:
                        allow_delete_pair = True
                        assistant_child = child
            if not allow_delete_pair:
                raise ValueError("Cannot delete message that has follow-up responses. Only the most recent leaf message can be deleted.")

        # Count active messages in the branch to determine if branch should also be soft-deleted
        active_messages_in_branch = db.query(Message).filter(
            Message.conversation_id == conversation_id,
            Message.branch_name == branch_name,
            Message.user_id == user_id,
            Message.is_active == True
        ).count()

        try:
            # Soft-delete the message (user)
            msg.is_active = False
            db.add(msg)

            branch_deleted = False
            deleted_ids = [str(msg.id)]

            # If we're deleting an assistant child together with the user message, soft-delete it too
            if assistant_child is not None and assistant_child.is_active:
                assistant_child.is_active = False
                db.add(assistant_child)
                # Adjust the active messages count to reflect both deletions
                active_messages_in_branch -= 1
                deleted_ids.append(str(assistant_child.id))

            # If this was the only active message in the branch and branch != main, soft-delete the branch
            if active_messages_in_branch <= 1 and branch_name != "main":
                branch = db.query(Branch).filter(
                    Branch.conversation_id == conversation_id,
                    Branch.name == branch_name,
                    Branch.user_id == user_id,
                    Branch.is_active == True
                ).first()
                if branch:
                    branch.is_active = False
                    db.add(branch)
                    branch_deleted = True

            db.commit()
            return {"deleted_ids": deleted_ids, "message_id": message_id, "branch_name": branch_name, "branch_deleted": branch_deleted}
        except Exception:
            db.rollback()
            raise
    
    def regenerate_message_in_branch(self, db: Session, conversation_id: str, message_id: str, branch_name: str, user_id: str) -> tuple[Branch, Message]:
        """Regenerate an AI message by creating a new branch from the previous user message"""
        # Get the AI message to regenerate
        ai_message = db.query(Message).filter(
            Message.id == message_id,
            Message.conversation_id == conversation_id,
            Message.user_id == user_id,
            Message.role == "assistant"
        ).first()
        
        if not ai_message:
            raise ValueError("AI message not found or does not belong to user")
        
        # Check if this message has any children (follow-up messages)
        children = db.query(Message).filter(
            Message.parent_id == message_id,
            Message.conversation_id == conversation_id,
            Message.user_id == user_id
        ).all()
        
        if children:
            raise ValueError("Cannot regenerate message that has follow-up responses. Only the most recent message in a branch can be regenerated.")
        
        # Check if any branches were created from this message
        branches_from_message = db.query(Branch).filter(
            Branch.created_from_message_id == message_id,
            Branch.conversation_id == conversation_id,
            Branch.user_id == user_id
        ).all()
        
        if branches_from_message:
            raise ValueError("Cannot regenerate message that has branches created from it. Only the most recent message in a branch can be regenerated.")
        
        # Get the user message that prompted this AI response
        user_message = db.query(Message).filter(
            Message.id == ai_message.parent_id,
            Message.conversation_id == conversation_id,
            Message.user_id == user_id,
            Message.role == "user"
        ).first()
        
        if not user_message:
            raise ValueError("Parent user message not found")
        
        # Generate unique branch name
        final_branch_name = self.generate_unique_branch_name(db, conversation_id, branch_name, user_id)
        
        # Determine the message to branch from
        # For regeneration, we want to branch from the user message that prompted the AI response
        branch_from_message_id = str(user_message.id)
        
        # Create new branch from the user message
        branch_data = BranchCreate(
            name=final_branch_name,
            created_from_message_id=branch_from_message_id,
            color="#4CAF50"  # Default green color for regeneration branches
        )
        
        new_branch = self.create_branch_without_validation(db, conversation_id, branch_data, user_id)
        
        # Copy the user message to the new branch
        new_user_message = Message(
            conversation_id=conversation_id,
            content=user_message.content,
            role=user_message.role,
            parent_id=user_message.parent_id,
            branch_name=final_branch_name,
            llm_model=user_message.llm_model,
            user_id=user_id,
            created_at=datetime.now(timezone.utc)
        )
        
        db.add(new_user_message)
        db.commit()
        db.refresh(new_user_message)
        
        return new_branch, new_user_message
    
    def regenerate_message_in_place(self, db: Session, conversation_id: str, message_id: str, user_id: str) -> tuple[str, str, str]:
        """Regenerate an AI message in place by updating its content instead of deleting"""
        # Get the AI message to regenerate
        ai_message = db.query(Message).filter(
            Message.id == message_id,
            Message.conversation_id == conversation_id,
            Message.user_id == user_id,
            Message.role == "assistant"
        ).first()
        
        if not ai_message:
            raise ValueError("AI message not found or does not belong to user")
        
        # Check if this message has any children (follow-up messages)
        children = db.query(Message).filter(
            Message.parent_id == message_id,
            Message.conversation_id == conversation_id,
            Message.user_id == user_id
        ).all()
        
        if children:
            raise ValueError("Cannot regenerate message that has follow-up responses. Only the most recent message in a branch can be regenerated.")
        
        # Check if any branches were created from this message
        branches_from_message = db.query(Branch).filter(
            Branch.created_from_message_id == message_id,
            Branch.conversation_id == conversation_id,
            Branch.user_id == user_id
        ).all()
        
        if branches_from_message:
            raise ValueError("Cannot regenerate message that has branches created from it. Only the most recent message in a branch can be regenerated.")
        
        # Return the original message info for regeneration
        return ai_message.id, ai_message.branch_name, ai_message.llm_model or "google/gemma-3-27b-it:free"
    
    def create_branch_without_validation(self, db: Session, conversation_id: str, branch: BranchCreate, user_id: str) -> Branch:
        """Create a new branch without name validation (for internal use)"""
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
    
    def build_conversation_tree(self, db: Session, conversation_id: str, user_id: str) -> ConversationTree:
        """Build the complete conversation tree structure"""
        conversation = self.get_conversation(db, conversation_id, user_id)
        if not conversation:
            raise ValueError("Conversation not found or does not belong to user")
        
        # Get all ACTIVE messages for this specific conversation and user
        messages = db.query(Message).filter(
            Message.conversation_id == conversation_id,
            Message.user_id == user_id,
            Message.is_active == True
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
        print(f"🌱 Root messages: {len(root_messages)} - {root_messages}")
        print(f"🔗 Orphaned messages: {len(orphaned_messages)} - {orphaned_messages}")
        
        # Additional debug: show all messages and their parent relationships
        print("📝 All messages in conversation:")
        for msg in messages:
            print(f"  {msg.id}: role={msg.role}, branch={msg.branch_name}, parent_id={msg.parent_id}")
        
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

class LLMService:
    """
    LLM Service for ChatBranch - supports both dummy responses and real LLM calls
    
    Configuration:
    - Set USE_DUMMY_RESPONSES=false in .env to enable real LLM calls
    
    Message Format:
    - Uses standard OpenAI format: [{"role": "user/assistant", "content": "..."}]
    """
    
    def __init__(self):
        # Configuration - set USE_DUMMY_RESPONSES=false in .env to use real LLMs
        self.use_dummy_responses = os.getenv("USE_DUMMY_RESPONSES", "true").lower() == "true"
        
        # No environment mutation; use OPENROUTER_API_KEY as server default
        # Client-provided per-request keys are accepted via `client_api_key` argument
        
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
    
    async def generate_response(self, context: List[Dict], model: str = "google/gemma-3-27b-it:free", client_api_key: Optional[str] = None, **options: Any) -> str:
        """
        Generate a response using OpenRouter for any supported model.
        Falls back to dummy response if USE_DUMMY_RESPONSES is true or on error.

        Accepts an optional `client_api_key` which will be used for this single call only.
        """
        # If explicitly requesting demo responses via the special model id, always use dummy generator
        if model == "demo-response":
            return await self._generate_dummy_response(context, model)

        use_dummy = os.getenv("USE_DUMMY_RESPONSES", "true").lower() == "true"
        if use_dummy:
            return await self._generate_dummy_response(context, model)

        # Delegate to helper that supports per-request API keys
        return await self._call_openrouter(context=context, model=model, client_api_key=client_api_key, **options)

    async def _call_openrouter(self, context: List[Dict], model: str, client_api_key: Optional[str] = None, **options: Any) -> str:
        """
        Call OpenRouter to generate a chat completion. Uses `client_api_key` for a single request
        if provided; otherwise falls back to server `OPENROUTER_API_KEY` from the environment.
        """
        mapped_model = model

        # Normalize context to OpenRouter message format
        formatted_context = []
        for msg in context:
            role = msg.get("role")
            if role not in ("user", "assistant", "system"):
                role = "user" if role == "model" else "assistant"
            formatted_context.append({"role": role, "content": msg["content"]})

        api_key = client_api_key or os.getenv("OPENROUTER_API_KEY", "")
        if not api_key:
            raise Exception("No OpenRouter API key available (set OPENROUTER_API_KEY or provide client_api_key).")

        try:
            async with OpenRouter(api_key=api_key) as client:
                # Use send_async for async requests per SDK docs
                response = await client.chat.send_async(
                    model=mapped_model,
                    messages=formatted_context,
                    temperature=options.get("temperature", 0.7),
                    max_tokens=options.get("max_tokens"),
                )

                # Response structure follows SDK docs
                if response and getattr(response, "choices", None):
                    return response.choices[0].message.content
                # Fallback: try to extract from raw dict
                if isinstance(response, dict) and response.get("choices"):
                    return response["choices"][0]["message"]["content"]

                raise Exception("Unexpected response shape from OpenRouter")
        except Exception as e:
            print(f"❌ Error calling OpenRouter: {e}")
            raise
    
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
        # Check for configured OpenRouter API key
        has_key = bool(os.getenv("OPENROUTER_API_KEY"))
        return has_key
    
    async def _generate_dummy_response(self, context: List[Dict], model: str, error_fallback: bool = False) -> str:
        """Generate a simple dummy AI response for testing: small delay, fixed responses."""
        # Small fixed delay to simulate network/processing
        await asyncio.sleep(0.2)
        base_response = random.choice(self.dummy_responses)
        return self._format_response_for_model(base_response, model, error_fallback)

    def _format_response_for_model(self, base_response: str, model: str, error_fallback: bool = False) -> str:
        """Apply a small model prefix to dummy responses for clarity."""
        if error_fallback:
            model_prefix = f"[FALLBACK-DEMO {model}] "
        elif self.use_dummy_responses:
            model_prefix = f"[DEMO {model}] "
        else:
            model_prefix = ""
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
