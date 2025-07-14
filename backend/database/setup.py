#!/usr/bin/env python3
"""
Database setup script for ChatBranch
Cross-platform database initialization

Run this from the root directory after installing requirements.txt
"""

import os
import sys
import subprocess
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

def run_command(command, description):
    """Run a command and handle errors"""
    print(f"🔧 {description}...")
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Error: {e}")
        print(f"Output: {e.stdout}")
        print(f"Error: {e.stderr}")
        return False

def check_postgresql():
    """Check if PostgreSQL is running"""
    try:
        subprocess.run(['psql', '--version'], check=True, capture_output=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False

def create_database():
    """Create database and user"""
    try:
        # Connect to PostgreSQL as superuser
        conn = psycopg2.connect(
            host='localhost',
            database='postgres',
            user='postgres',
            password='postgres'
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()
        
        # Create database
        try:
            cursor.execute("CREATE DATABASE chatbranch;")
            print("✅ Database 'chatbranch' created")
        except psycopg2.errors.DuplicateDatabase:
            print("ℹ️  Database 'chatbranch' already exists")
        
        # Create user
        try:
            cursor.execute("CREATE USER chatbranch_user WITH PASSWORD 'chatbranch_password';")
            print("✅ User 'chatbranch_user' created")
        except psycopg2.errors.DuplicateObject:
            print("ℹ️  User 'chatbranch_user' already exists")
        
        # Grant database privileges
        cursor.execute("GRANT ALL PRIVILEGES ON DATABASE chatbranch TO chatbranch_user;")
        print("✅ Database privileges granted")
        
        cursor.close()
        conn.close()
        
        # Now connect to the chatbranch database to set schema permissions
        conn = psycopg2.connect(
            host='localhost',
            database='chatbranch',
            user='postgres',
            password='postgres'
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()
        
        # Grant schema privileges (required for PostgreSQL 15+)
        cursor.execute("GRANT ALL ON SCHEMA public TO chatbranch_user;")
        print("✅ Schema privileges granted")
        
        cursor.execute("GRANT CREATE ON SCHEMA public TO chatbranch_user;")
        print("✅ Table creation privileges granted")
        
        # Grant usage privileges on schema
        cursor.execute("GRANT USAGE ON SCHEMA public TO chatbranch_user;")
        print("✅ Schema usage privileges granted")
        
        cursor.close()
        conn.close()
        return True
        
    except psycopg2.Error as e:
        print(f"❌ Database error: {e}")
        return False

def main():
    print("🚀 ChatBranch Database Setup")
    print("=" * 40)
    
    # Check if we're in the right directory
    if not os.path.exists("./requirements.txt"):
        print("❌ Please run this script from the ChatBranch root directory")
        print("   Example: python database/setup.py  # From backend directory")
        sys.exit(1)
    
    # Check if PostgreSQL is available
    if not check_postgresql():
        print("❌ PostgreSQL is not installed or not in PATH")
        print("\nInstallation instructions:")
        print("  Ubuntu/WSL2: sudo apt install postgresql postgresql-contrib")
        print("  Windows: Download from https://www.postgresql.org/download/windows/")
        print("  macOS: brew install postgresql")
        sys.exit(1)
    
    print("✅ PostgreSQL is available")
    
    # Create database and user
    if create_database():
        print("\n🎉 Database setup complete!")
        print("\nConnection details:")
        print("  Database: chatbranch")
        print("  User: chatbranch_user")
        print("  Password: chatbranch_password")
        print("  URL: postgresql://chatbranch_user:chatbranch_password@localhost/chatbranch")
        
        print("\nNext steps:")
        print("  1. Copy backend/.env.example to backend/.env")
        print("  2. Add your API keys to backend/.env")
        print("  3. Run: python database/init_tables.py  # From backend directory")
    else:
        print("❌ Database setup failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
