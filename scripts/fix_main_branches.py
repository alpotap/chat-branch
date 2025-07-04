#!/usr/bin/env python3
"""
Fix conversations with renamed or missing main branches.

This script helps repair conversations where the main branch was renamed,
causing issues with conversation loading. It creates a proper main branch
and optionally moves the renamed content to a new named branch.

PREREQUISITES:
1. Backend must be stopped before running this script
2. Direct database access required
3. Make sure to backup the database first!

Usage:
    python fix_main_branches.py --list               # List problematic conversations
    python fix_main_branches.py --fix-all           # Fix all conversations automatically
    python fix_main_branches.py --fix-conv <conv_id> # Fix specific conversation
"""

import sys
import os
from pathlib import Path
import argparse
from datetime import datetime
import uuid

# Add the backend directory to Python path
backend_dir = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

try:
    from app.database import get_db, engine
    from app.models import Conversation, Message, Branch, User
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy import text
except ImportError as e:
    print(f"❌ Could not import backend modules: {e}")
    print("Make sure you're running from the scripts directory and backend is set up correctly.")
    sys.exit(1)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def find_problematic_conversations():
    """Find conversations that don't have a proper main branch"""
    db = SessionLocal()
    try:
        print("🔍 Scanning for conversations with main branch issues...")
        
        # Find conversations where main branch messages exist but no main branch record
        conversations_with_main_messages = db.execute(text("""
            SELECT DISTINCT conversation_id, user_id
            FROM messages 
            WHERE branch_name = 'main'
        """)).fetchall()
        
        # Find conversations where main branch was renamed (no main messages but has other branches)
        conversations_without_main = db.execute(text("""
            SELECT DISTINCT c.id as conversation_id, c.user_id, c.title
            FROM conversations c
            WHERE c.id NOT IN (
                SELECT DISTINCT conversation_id 
                FROM messages 
                WHERE branch_name = 'main'
            )
            AND c.id IN (
                SELECT DISTINCT conversation_id
                FROM messages
            )
        """)).fetchall()
        
        print(f"📊 Found {len(conversations_without_main)} conversations without main branch")
        print(f"📊 Found {len(conversations_with_main_messages)} conversations with main branch messages")
        
        # Get detailed info about problematic conversations
        problems = []
        
        for conv in conversations_without_main:
            # Get the branches that exist in this conversation
            existing_branches = db.execute(text("""
                SELECT DISTINCT branch_name, COUNT(*) as message_count
                FROM messages 
                WHERE conversation_id = :conv_id
                GROUP BY branch_name
                ORDER BY message_count DESC
            """), {"conv_id": str(conv.conversation_id)}).fetchall()  # Convert UUID to string
            
            problems.append({
                "id": str(conv.conversation_id),  # Convert UUID to string
                "user_id": str(conv.user_id),     # Convert UUID to string
                "title": conv.title,
                "issue": "missing_main",
                "existing_branches": [(b.branch_name, b.message_count) for b in existing_branches]
            })
        
        return problems
        
    finally:
        db.close()

def fix_conversation(conversation_id: str, dry_run: bool = False):
    """Fix a specific conversation by creating a main branch"""
    db = SessionLocal()
    try:
        print(f"\n🔧 {'[DRY RUN] ' if dry_run else ''}Fixing conversation: {conversation_id}")
        
        # Get conversation info
        conversation = db.query(Conversation).filter(Conversation.id == str(conversation_id)).first()
        if not conversation:
            print(f"❌ Conversation {conversation_id} not found")
            return False
        
        print(f"📝 Conversation: '{conversation.title}'")
        
        # Check if main branch already exists
        main_messages = db.query(Message).filter(
            Message.conversation_id == str(conversation_id),  # Ensure string
            Message.branch_name == "main"
        ).first()
        
        if main_messages:
            print(f"✅ Main branch already exists, skipping")
            return True
        
        # Find the most likely "main" branch (usually the one with most messages or earliest creation)
        branch_stats = db.execute(text("""
            SELECT branch_name, COUNT(*) as message_count, MIN(created_at) as earliest_message
            FROM messages 
            WHERE conversation_id = :conv_id
            GROUP BY branch_name
            ORDER BY earliest_message ASC, message_count DESC
        """), {"conv_id": str(conversation_id)}).fetchall()  # Ensure string conversion
        
        if not branch_stats:
            print(f"❌ No messages found in conversation")
            return False
        
        # The first branch (earliest + most messages) becomes the new main
        original_main_branch = branch_stats[0].branch_name
        print(f"🎯 Will convert branch '{original_main_branch}' to main branch")
        print(f"   Messages to convert: {branch_stats[0].message_count}")
        
        if not dry_run:
            # Rename the branch messages to 'main'
            messages_updated = db.execute(text("""
                UPDATE messages 
                SET branch_name = 'main'
                WHERE conversation_id = :conv_id AND branch_name = :old_branch
            """), {"conv_id": str(conversation_id), "old_branch": original_main_branch}).rowcount
            
            # Update branch record if it exists
            branch_record = db.query(Branch).filter(
                Branch.conversation_id == str(conversation_id),  # Ensure string
                Branch.name == original_main_branch
            ).first()
            
            if branch_record:
                branch_record.name = "main"
                print(f"📝 Updated branch record")
            
            db.commit()
            print(f"✅ Converted {messages_updated} messages from '{original_main_branch}' to 'main'")
        else:
            print(f"📋 Would convert {branch_stats[0].message_count} messages from '{original_main_branch}' to 'main'")
        
        return True
        
    except Exception as e:
        print(f"❌ Error fixing conversation {conversation_id}: {e}")
        db.rollback()
        return False
    finally:
        db.close()

def main():
    parser = argparse.ArgumentParser(description="Fix conversations with missing or renamed main branches")
    parser.add_argument("--list", action="store_true", help="List problematic conversations")
    parser.add_argument("--fix-all", action="store_true", help="Fix all problematic conversations")
    parser.add_argument("--fix-conv", help="Fix specific conversation by ID")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done without making changes")
    
    args = parser.parse_args()
    
    if not any([args.list, args.fix_all, args.fix_conv]):
        parser.print_help()
        return
    
    try:
        if args.list or args.fix_all:
            problems = find_problematic_conversations()
            
            if args.list:
                print(f"\n📋 Found {len(problems)} problematic conversations:")
                for p in problems:
                    print(f"\n🔸 {p['id'][:8]}... - '{p['title']}'")
                    print(f"   Issue: {p['issue']}")
                    print(f"   Existing branches: {p['existing_branches']}")
            
            if args.fix_all:
                print(f"\n🔧 {'[DRY RUN] ' if args.dry_run else ''}Fixing {len(problems)} conversations...")
                success_count = 0
                for p in problems:
                    if fix_conversation(p['id'], args.dry_run):
                        success_count += 1
                print(f"\n{'✅' if not args.dry_run else '📋'} {'Fixed' if not args.dry_run else 'Would fix'} {success_count}/{len(problems)} conversations")
        
        elif args.fix_conv:
            fix_conversation(args.fix_conv, args.dry_run)
            
    except KeyboardInterrupt:
        print("\n🛑 Operation cancelled by user")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
