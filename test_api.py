#!/usr/bin/env python3
"""
Test script for ChatBranch API
Run this to test your backend endpoints
"""

import requests
import json
import sys

BASE_URL = "http://localhost:8001"

def test_api():
    print("🚀 Testing ChatBranch API...")
    
    # Test 1: Check if API is running
    try:
        response = requests.get(f"{BASE_URL}/")
        print(f"✅ API Status: {response.json()}")
    except requests.exceptions.ConnectionError:
        print("❌ API is not running. Start it with: uvicorn main:app --reload")
        return False
    
    # Test 2: Create conversation
    conv_data = {"title": "Test Conversation"}
    response = requests.post(f"{BASE_URL}/conversations", json=conv_data)
    
    if response.status_code == 200:
        conversation = response.json()
        conv_id = conversation["id"]
        print(f"✅ Created conversation: {conversation['title']} ({conv_id})")
    else:
        print(f"❌ Failed to create conversation: {response.text}")
        return False
    
    # Test 3: Add a message
    message_data = {
        "content": "Hello, this is a test message",
        "role": "user",
        "branch_name": "main",
        "llm_model": "gpt-3.5-turbo"
    }
    response = requests.post(f"{BASE_URL}/conversations/{conv_id}/messages", json=message_data)
    
    if response.status_code == 200:
        message = response.json()
        print(f"✅ Added message: {message['content'][:50]}...")
    else:
        print(f"❌ Failed to add message: {response.text}")
        return False
    
    # Test 4: Get conversation tree
    response = requests.get(f"{BASE_URL}/conversations/{conv_id}")
    
    if response.status_code == 200:
        tree = response.json()
        print(f"✅ Retrieved conversation tree with {len(tree['messages'])} messages")
        print(f"   Branches: {len(tree['branches'])}")
    else:
        print(f"❌ Failed to get conversation: {response.text}")
        return False
    
    print("\n🎉 All tests passed! Your ChatBranch API is working correctly.")
    print("\nNext steps:")
    print("1. Set up your .env file with API keys")
    print("2. Start the frontend: cd frontend && npm install && npm start")
    print("3. Open http://localhost:3000 in your browser")
    
    return True

if __name__ == "__main__":
    test_api()
