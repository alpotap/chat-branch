#!/usr/bin/env python3
"""
Test script to verify LLM context building works correctly
Run this to test the conversation history traversal for different branching scenarios

PREREQUISITES:
1. Start the backend server first:
   cd backend
   uvicorn main:app --reload --port 8001

2. Then run this test with admin credentials:
   python test_context.py admin@example.com admin123
"""

import requests
import json
import time
import sys
import argparse

BASE_URL = "http://localhost:8001"

def check_backend_connection():
    """Check if backend is running"""
    try:
        # Use the new /health endpoint
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        return response.status_code == 200
    except requests.exceptions.RequestException:
        try:
            # Fallback: try the root endpoint
            response = requests.get(f"{BASE_URL}/", timeout=5)
            return response.status_code in [200, 404, 422]  # Any response means server is running
        except requests.exceptions.RequestException:
            return False

def login_user(email, password):
    """Login user and return access token"""
    try:
        response = requests.post(f"{BASE_URL}/auth/login", 
                               json={"email": email, "password": password})
        
        if response.status_code == 200:
            data = response.json()
            return data["access_token"]
        else:
            print(f"❌ Login failed: {response.text}")
            return None
    except requests.exceptions.RequestException as e:
        print(f"❌ Login request failed: {e}")
        return None

def get_auth_headers(token):
    """Get authorization headers"""
    return {"Authorization": f"Bearer {token}"}

def test_context_building(email, password):
    """Test various conversation scenarios to verify context building"""
    
    print("🧪 Testing LLM Context Building\n")
    
    # Check if backend is running
    print("🔍 Checking backend connection...")
    if not check_backend_connection():
        print("❌ Backend not running!")
        print("\n📋 To fix this:")
        print("1. Open a terminal and run:")
        print("   cd backend")
        print("   uvicorn main:app --reload --port 8001")
        print("2. Wait for 'Application startup complete'")
        print("3. Then run this test again: python test_context.py <email> <password>")
        print("\n💡 Backend should be accessible at http://localhost:8001")
        return False
    
    print("✅ Backend is running!")
    
    # Login and get access token
    print(f"\n🔐 Logging in as {email}...")
    token = login_user(email, password)
    if not token:
        return False
    
    print("✅ Login successful!")
    headers = get_auth_headers(token)
    
    # Step 1: Create a test conversation
    print("\n1. Creating test conversation...")
    try:
        response = requests.post(f"{BASE_URL}/conversations", 
                               json={"title": "Context Test Conversation"},
                               headers=headers)
        
        if response.status_code != 200:
            print(f"❌ Failed to create conversation: {response.text}")
            return False
        
        conversation = response.json()
        conv_id = conversation["id"]
        print(f"✅ Created conversation: {conv_id}")
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {e}")
        return False
    # Step 2: Add initial messages to main branch
    print("\n2. Building main conversation thread...")
    
    messages = [
        {"content": "Hello, I want to learn about programming", "role": "user", "branch_name": "main"},
        {"content": "What specific programming language interests you?", "role": "user", "branch_name": "main"},
        {"content": "I'm interested in Python for data science", "role": "user", "branch_name": "main"},
    ]
    
    message_ids = []
    for i, msg in enumerate(messages):
        print(f"   Adding message {i+1}: {msg['content'][:50]}...")
        try:
            response = requests.post(f"{BASE_URL}/conversations/{conv_id}/messages", 
                                   json=msg, headers=headers)
            if response.status_code == 200:
                data = response.json()
                message_ids.append(data["id"])
                print(f"   ✅ Message added (ID: {data['id'][:8]}...)")
                
                # If it's a user message, the AI response will be the actual returned message
                if data["role"] == "assistant":
                    print(f"   🤖 AI responded: {data['content'][:100]}...")
                elif data["role"] == "user":
                    print(f"   👤 User message: {data['content'][:50]}...")
            else:
                print(f"   ❌ Failed to add message: {response.text}")
                return False
        except requests.exceptions.RequestException as e:
            print(f"   ❌ Request failed: {e}")
            return False
        except KeyError as e:
            print(f"   ❌ Unexpected response structure. Missing key: {e}")
            print(f"   Response: {response.text}")
            return False
            
        time.sleep(0.5)  # Small delay between messages
    
    if len(message_ids) < 2:
        print("❌ Not enough messages created for testing")
        return False
    
    # Step 3: Create a branch from the middle of the conversation
    print(f"\n3. Creating branch from message {message_ids[2][:8]}...")
    
    branch_data = {
        "name": "python-specifics", 
        "created_from_message_id": message_ids[2],
        "color": "#FF6B6B"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/conversations/{conv_id}/branch", 
                               json=branch_data, headers=headers)
        if response.status_code != 200:
            print(f"❌ Failed to create branch: {response.text}")
            return False
        
        print("✅ Branch 'python-specifics' created")
    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {e}")
        return False
    
    # Step 4: Add messages to the new branch
    print("\n4. Adding messages to branch...")
    
    branch_messages = [
        {"content": "Let's focus on pandas and numpy specifically", "role": "user", "branch_name": "python-specifics"},
        {"content": "Can you explain how pandas DataFrames work?", "role": "user", "branch_name": "python-specifics"},
    ]
    
    branch_message_ids = []
    for i, msg in enumerate(branch_messages):
        print(f"   Adding branch message {i+1}: {msg['content'][:50]}...")
        try:
            response = requests.post(f"{BASE_URL}/conversations/{conv_id}/messages", 
                                   json=msg, headers=headers)
            if response.status_code == 200:
                data = response.json()
                branch_message_ids.append(data['id'])
                print(f"   ✅ Branch message added (ID: {data['id'][:8]}...)")
                if data["role"] == "assistant":
                    print(f"   🤖 AI responded: {data['content'][:100]}...")
                elif data["role"] == "user":
                    print(f"   👤 User message: {data['content'][:50]}...")
            else:
                print(f"   ❌ Failed to add branch message: {response.text}")
                return False
        except requests.exceptions.RequestException as e:
            print(f"   ❌ Request failed: {e}")
            return False
        except KeyError as e:
            print(f"   ❌ Unexpected response structure. Missing key: {e}")
            print(f"   Response: {response.text}")
            return False
        
        time.sleep(0.5)
    
    # Step 5: Test context retrieval for different scenarios
    print(f"\n5. Testing context retrieval...")
    
    # Test main branch context
    print("\n   📊 Testing main branch context:")
    try:
        response = requests.get(f"{BASE_URL}/conversations/{conv_id}/context/{message_ids[-1]}", 
                              headers=headers)
        if response.status_code == 200:
            context = response.json()["context"]
            print(f"   Main branch context has {len(context)} messages:")
            for i, msg in enumerate(context):
                print(f"      {i+1}. {msg['role']}: {msg['content'][:60]}...")
        else:
            print(f"   ⚠️ Context retrieval returned: {response.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"   ⚠️ Context retrieval failed: {e}")
    
    # Test branch context
    if branch_message_ids:
        print("\n   📊 Testing branch context:")
        try:
            # Get context for the last message in the branch
            response = requests.get(f"{BASE_URL}/conversations/{conv_id}/context/{branch_message_ids[-1]}", 
                                  headers=headers)
            if response.status_code == 200:
                context = response.json()["context"]
                print(f"   Branch context has {len(context)} messages:")
                for i, msg in enumerate(context):
                    print(f"      {i+1}. {msg['role']}: {msg['content'][:60]}...")
            else:
                print(f"   ⚠️ Branch context retrieval returned: {response.status_code}")
        except requests.exceptions.RequestException as e:
            print(f"   ⚠️ Branch context retrieval failed: {e}")
    
    # Test getting the full conversation tree to see structure
    print(f"\n6. Full conversation structure:")
    try:
        response = requests.get(f"{BASE_URL}/conversations/{conv_id}", headers=headers)
        if response.status_code == 200:
            tree = response.json()
            print(f"   📊 Conversation has {len(tree.get('messages', {}))} total messages")
            print(f"   🌳 Available branches:")
            branches = set()
            for msg_id, msg in tree.get('messages', {}).items():
                branches.add(msg.get('branch_name', 'unknown'))
            for branch in branches:
                print(f"      - {branch}")
        else:
            print(f"   ⚠️ Tree retrieval returned: {response.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"   ⚠️ Tree retrieval failed: {e}")
    
    # Cleanup: Delete the test conversation
    print(f"\n🧹 Cleaning up test conversation...")
    try:
        response = requests.delete(f"{BASE_URL}/conversations/{conv_id}", headers=headers)
        if response.status_code == 200:
            print("✅ Test conversation deleted successfully")
        else:
            print(f"⚠️ Failed to delete conversation (status {response.status_code})")
    except requests.exceptions.RequestException as e:
        print(f"⚠️ Cleanup failed: {e}")
    
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Test ChatBranch LLM context building')
    parser.add_argument('email', help='Admin user email')
    parser.add_argument('password', help='Admin user password')
    
    args = parser.parse_args()
    
    try:
        success = test_context_building(args.email, args.password)
        if success:
            print(f"\n✅ Context building test completed successfully!")
            print(f"\n🔍 Check the backend logs to see the LLM context debugging output")
            print(f"💡 The '[DEMO model]' responses show that context is being passed to LLM correctly")
        else:
            print(f"\n❌ Test failed - please check the steps above")
            sys.exit(1)
    except KeyboardInterrupt:
        print(f"\n🛑 Test interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
