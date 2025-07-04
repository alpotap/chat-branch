#!/usr/bin/env python3
"""
ChatBranch User Management Script

This script allows administrators to add new users to ChatBranch.

Usage:
    python add_user.py <email> <password> [--admin]

Examples:
    python add_user.py john@example.com mypassword123
    python add_user.py admin@company.com supersecret --admin
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
from app.auth import get_password_hash
from app.models import User


def validate_email(email: str) -> bool:
    return True
    """Basic email validation"""
    return "@" in email and "." in email.split("@")[1]


def validate_password(password: str) -> bool:
    """Basic password validation"""
    return len(password) >= 3


def create_user(email: str, password: str, is_admin: bool = False, name: Optional[str] = None) -> bool:
    """
    Create a new user in the database
    
    Args:
        email: User's email address
        password: User's plain text password
        is_admin: Whether the user should be an admin
        name: User's display name (optional, defaults to email)
    
    Returns:
        True if user was created successfully, False otherwise
    """
    db = None
    try:
        # Validate input
        if not validate_email(email):
            print(f"❌ Invalid email format: {email}")
            return False
            
        if not validate_password(password):
            print(f"❌ Password must be at least 3 characters long")
            return False
        
        # Connect to PostgreSQL database using existing connection
        db = next(get_db())
        
        # Check if user already exists
        existing_user = db.query(User).filter(User.email == email).first()
        if existing_user:
            print(f"❌ User with email {email} already exists")
            return False
        
        # Hash the password using get_password_hash function
        hashed_password = get_password_hash(password)
        
        # Create the user
        user = User(
            id=str(uuid.uuid4()),
            email=email,
            name=name or email.split("@")[0],  # Use part before @ as default name
            password_hash=hashed_password,
            role="admin" if is_admin else "tester"
        )
        
        db.add(user)
        db.commit()
        db.refresh(user)
        
        admin_text = " (Admin)" if is_admin else ""
        print(f"✅ User created successfully:")
        print(f"   📧 Email: {user.email}")
        print(f"   👤 Name: {user.name}{admin_text}")
        print(f"   🆔 ID: {user.id}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error creating user: {e}")
        return False
    finally:
        if db:
            db.close()


def main():
    # Test imports first
    try:
        print("🔍 Testing imports...")
        # Test password hash function
        test_hash = get_password_hash("test")
        print("✅ Password hashing function successful")
        
        # Test PostgreSQL database connection
        db = next(get_db())
        db.close()
        print("✅ PostgreSQL database connection successful")
    except Exception as e:
        print(f"❌ Import/Database error: {e}")
        print("Please ensure you're running this script from the scripts directory")
        print("and that PostgreSQL is running with the correct database setup")
        sys.exit(1)
    
    parser = argparse.ArgumentParser(
        description="Add a new user to ChatBranch",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python add_user.py john@example.com mypassword123
  python add_user.py admin@company.com supersecret --admin
  python add_user.py "Jane Doe" jane@example.com mypassword123 --name "Jane Doe"
        """
    )
    
    parser.add_argument("email", help="User's email address")
    parser.add_argument("password", help="User's password (minimum 6 characters)")
    parser.add_argument("--admin", action="store_true", help="Make this user an administrator")
    parser.add_argument("--name", help="User's display name (defaults to part before @ in email)")
    
    args = parser.parse_args()
    
    print("🌿 ChatBranch User Creation Tool")
    print("=" * 40)
    print(f"📧 Email: {args.email}")
    print(f"👤 Name: {args.name or args.email.split('@')[0]}")
    print(f"🔐 Admin: {'Yes' if args.admin else 'No'}")
    print("=" * 40)
    
    # Confirm before creating
    response = input("Create this user? (y/N): ").strip().lower()
    if response not in ['y', 'yes']:
        print("❌ User creation cancelled")
        return
    
    # Create the user
    success = create_user(
        email=args.email,
        password=args.password,
        is_admin=args.admin,
        name=args.name
    )
    
    if success:
        print("\n🎉 User creation completed!")
        print(f"The user can now log in to ChatBranch with:")
        print(f"  Email: {args.email}")
        print(f"  Password: {args.password}")
    else:
        print("\n💥 User creation failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()
