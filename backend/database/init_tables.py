#!/usr/bin/env python3
"""
Initialize database tables for ChatBranch
Run this from the root directory after setting up the database
"""

import sys
import os
from pathlib import Path

# Add the parent directory (backend) to the Python path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.database import engine, Base
from app.models import Conversation, Message, Branch

def init_tables():
    """Create all database tables"""
    try:
        print("🗄️  Creating database tables...")
        Base.metadata.create_all(bind=engine)
        print("✅ Database tables created successfully!")
        print("\nTables created:")
        print("  - conversations")
        print("  - messages")
        print("  - branches")
        return True
    except Exception as e:
        print(f"❌ Error creating tables: {e}")
        return False

def main():
    print("🚀 ChatBranch Database Table Initialization")
    print("=" * 50)
    
    # Check if we're in the right directory
    if not os.path.exists("./requirements.txt"):
        print("❌ Please run this script from the ChatBranch root directory")
        print("   Example: python database/init_tables.py  # From backend directory")
        return False
    
    # Check if .env file exists
    env_file = backend_dir / ".env"
    if not env_file.exists():
        print("❌ .env file not found in backend directory")
        print("Please copy backend/.env.example to backend/.env and configure your database settings")
        return False
    
    if init_tables():
        print("\n🎉 Database initialization complete!")
        print("You can now start the ChatBranch backend server.")
    else:
        print("❌ Database initialization failed")
        return False

if __name__ == "__main__":
    main()
