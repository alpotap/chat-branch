#!/usr/bin/env python3
"""
ChatBranch User Removal Script

This script allows administrators to remove users from ChatBranch.
WARNING: This will delete the user and ALL their conversations, messages, and branches!

Usage:
    python remove_user.py <email_or_user_id>

Examples:
    python remove_user.py test@123
    python remove_user.py user-uuid-here
"""

import argparse
import sys
import os
import uuid
from pathlib import Path
from typing import Optional

# Add the backend directory to the path so we can import our modules
backend_dir = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from app.database import get_db, engine
from app.models import User, Conversation, Message, Branch


def is_valid_uuid(value: str) -> bool:
    """Check if a string is a valid UUID"""
    try:
        uuid.UUID(value)
        return True
    except ValueError:
        return False


def find_user(db, identifier: str) -> Optional[User]:
    """Find user by email or user ID"""
    # Try to find by email first
    user = db.query(User).filter(User.email == identifier).first()
    if user:
        return user
    
    # If not found and identifier looks like UUID, try by ID
    if is_valid_uuid(identifier):
        user = db.query(User).filter(User.id == identifier).first()
        return user
    
    return None


def get_user_stats(db, user: User) -> dict:
    """Get statistics about user's data"""
    conversations = db.query(Conversation).filter(Conversation.user_id == user.id).all()
    total_messages = 0
    total_branches = 0
    
    for conv in conversations:
        messages = db.query(Message).filter(Message.conversation_id == conv.id).count()
        branches = db.query(Branch).filter(Branch.conversation_id == conv.id).count()
        total_messages += messages
        total_branches += branches
    
    return {
        'conversations': len(conversations),
        'messages': total_messages,
        'branches': total_branches
    }


def remove_user(identifier: str, force: bool = False) -> bool:
    """
    Remove a user and all their data from the database
    
    Args:
        identifier: User's email or user ID
        force: Skip confirmation if True
    
    Returns:
        True if user was removed successfully, False otherwise
    """
    db = None
    try:
        # Connect to PostgreSQL database
        db = next(get_db())
        
        # Find the user
        user = find_user(db, identifier)
        if not user:
            print(f"❌ User not found: {identifier}")
            return False
        
        # Get user statistics
        stats = get_user_stats(db, user)
        
        print(f"🔍 Found user:")
        print(f"   📧 Email: {user.email}")
        print(f"   👤 Name: {user.name}")
        print(f"   🔐 Role: {user.role}")
        print(f"   🆔 ID: {user.id}")
        print(f"   📅 Created: {user.created_at}")
        print(f"\n📊 Data to be deleted:")
        print(f"   💬 Conversations: {stats['conversations']}")
        print(f"   📝 Messages: {stats['messages']}")
        print(f"   🌳 Branches: {stats['branches']}")
        
        if not force:
            print(f"\n⚠️  WARNING: This will permanently delete the user and ALL their data!")
            response = input("Are you sure you want to delete this user? (yes/NO): ").strip().lower()
            if response != 'yes':
                print("❌ User removal cancelled")
                return False
        
        # Delete the user (cascades to all related data due to foreign key constraints)
        db.delete(user)
        db.commit()
        
        print(f"\n✅ User {user.email} and all associated data has been deleted successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Error removing user: {e}")
        if db:
            db.rollback()
        return False
    finally:
        if db:
            db.close()


def list_all_users():
    """List all users in the system"""
    db = None
    try:
        db = next(get_db())
        users = db.query(User).all()
        
        if not users:
            print("📭 No users found in the database")
            return
        
        print(f"👥 Found {len(users)} users:")
        print("=" * 80)
        
        for user in users:
            stats = get_user_stats(db, user)
            admin_badge = " 👑" if user.role == "admin" else ""
            print(f"📧 {user.email:<25} 👤 {user.name:<20} 🔐 {user.role:<8}{admin_badge}")
            print(f"   🆔 {user.id}")
            print(f"   📊 {stats['conversations']} conversations, {stats['messages']} messages, {stats['branches']} branches")
            print(f"   📅 Created: {user.created_at}")
            print("-" * 80)
            
    except Exception as e:
        print(f"❌ Error listing users: {e}")
    finally:
        if db:
            db.close()


def main():
    # Test imports first
    try:
        print("🔍 Testing database connection...")
        db = next(get_db())
        db.close()
        print("✅ PostgreSQL database connection successful")
    except Exception as e:
        print(f"❌ Database connection error: {e}")
        print("Please ensure PostgreSQL is running and the database is set up correctly")
        sys.exit(1)
    
    parser = argparse.ArgumentParser(
        description="Remove a user from ChatBranch",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python remove_user.py test@123
  python remove_user.py user-uuid-here
  python remove_user.py --list
  python remove_user.py test@123 --force
        """
    )
    
    parser.add_argument("identifier", nargs='?', help="User's email address or user ID")
    parser.add_argument("--list", action="store_true", help="List all users in the system")
    parser.add_argument("--force", action="store_true", help="Skip confirmation prompt")
    
    args = parser.parse_args()
    
    if args.list:
        print("🌿 ChatBranch User List")
        print("=" * 40)
        list_all_users()
        return
    
    if not args.identifier:
        print("❌ Please provide a user email or ID, or use --list to see all users")
        parser.print_help()
        sys.exit(1)
    
    print("🗑️  ChatBranch User Removal Tool")
    print("=" * 40)
    
    # Remove the user
    success = remove_user(args.identifier, args.force)
    
    if success:
        print("\n🎉 User removal completed!")
    else:
        print("\n💥 User removal failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()
