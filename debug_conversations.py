#!/usr/bin/env python3
"""
Debug script to test conversation integrity and diagnose splitting issues.
Run this script to check for conversation integrity problems.
"""

import requests
import json
import time

API_BASE = "http://localhost:8001"

def debug_conversation(conversation_id):
    """Get debug information for a conversation"""
    try:
        response = requests.get(f"{API_BASE}/conversations/{conversation_id}/debug")
        if response.status_code == 200:
            return response.json()
        else:
            print(f"❌ Error getting debug info: {response.status_code}")
            return None
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

def fix_conversation(conversation_id):
    """Attempt to fix conversation integrity issues"""
    try:
        response = requests.post(f"{API_BASE}/conversations/{conversation_id}/fix")
        if response.status_code == 200:
            return response.json()
        else:
            print(f"❌ Error fixing conversation: {response.status_code}")
            return None
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

def list_conversations():
    """List all conversations"""
    try:
        response = requests.get(f"{API_BASE}/conversations")
        if response.status_code == 200:
            return response.json()
        else:
            print(f"❌ Error listing conversations: {response.status_code}")
            return []
    except Exception as e:
        print(f"❌ Error: {e}")
        return []

def get_conversation_tree(conversation_id):
    """Get full conversation tree"""
    try:
        response = requests.get(f"{API_BASE}/conversations/{conversation_id}")
        if response.status_code == 200:
            return response.json()
        else:
            print(f"❌ Error getting conversation tree: {response.status_code}")
            return None
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

def analyze_conversation(conversation_id):
    """Analyze a specific conversation for issues"""
    print(f"\n🔍 Analyzing Conversation: {conversation_id}")
    print("=" * 60)
    
    # Get debug info
    debug_info = debug_conversation(conversation_id)
    if debug_info:
        print(f"📊 Total Messages: {debug_info['total_messages']}")
        print(f"🌱 Root Messages: {len(debug_info['root_messages'])}")
        print(f"🚨 Invalid Parent Refs: {len(debug_info['invalid_parent_refs'])}")
        print(f"🔗 Orphaned Messages: {len(debug_info['orphaned_messages'])}")
        
        # Show branches
        print(f"\n🌿 Branches:")
        for branch_name, message_ids in debug_info['branches'].items():
            print(f"  - {branch_name}: {len(message_ids)} messages")
        
        # Show issues
        if debug_info['invalid_parent_refs']:
            print(f"\n⚠️  Invalid Parent References:")
            for msg in debug_info['invalid_parent_refs']:
                print(f"  - Message {msg['id']}: parent_id {msg['parent_id']} not found")
        
        if debug_info['orphaned_messages']:
            print(f"\n🏝️  Orphaned Messages:")
            for msg in debug_info['orphaned_messages']:
                print(f"  - Message {msg['id']}: {msg['reason']}")
    
    # Get tree structure
    tree = get_conversation_tree(conversation_id)
    if tree:
        print(f"\n🌳 Tree Structure:")
        print(f"  - Root messages in tree: {len(tree['root_messages'])}")
        print(f"  - Total nodes in tree: {len(tree['messages'])}")
        print(f"  - Branches defined: {len(tree['branches'])}")
        
        # Check for disconnected components
        connected_messages = set()
        
        def traverse_tree(message_id, visited):
            if message_id in visited:
                return
            visited.add(message_id)
            message = tree['messages'].get(message_id)
            if message:
                for child in message.get('children', []):
                    traverse_tree(child['id'], visited)
        
        # Start from each root and traverse
        for root_id in tree['root_messages']:
            traverse_tree(root_id, connected_messages)
        
        total_messages = len(tree['messages'])
        connected_count = len(connected_messages)
        
        if connected_count < total_messages:
            print(f"⚠️  Disconnected messages detected: {total_messages - connected_count}")
            
            # Find disconnected messages
            all_message_ids = set(tree['messages'].keys())
            disconnected = all_message_ids - connected_messages
            print(f"🔄 Disconnected message IDs: {list(disconnected)}")

def main():
    print("🌳 ChatBranch Conversation Debug Tool")
    print("=" * 50)
    
    # List all conversations
    conversations = list_conversations()
    if not conversations:
        print("❌ No conversations found or unable to connect to API")
        return
    
    print(f"📋 Found {len(conversations)} conversations:")
    for i, conv in enumerate(conversations):
        print(f"  {i + 1}. {conv['title']} ({conv['id']})")
    
    # Analyze each conversation
    for conv in conversations:
        analyze_conversation(conv['id'])
        
        # Ask if user wants to fix issues
        debug_info = debug_conversation(conv['id'])
        if debug_info and (debug_info['invalid_parent_refs'] or debug_info['orphaned_messages']):
            response = input(f"\n🔧 Fix issues in conversation '{conv['title']}'? (y/n): ")
            if response.lower() == 'y':
                print("🔧 Attempting to fix issues...")
                fix_result = fix_conversation(conv['id'])
                if fix_result:
                    print("✅ Fix results:")
                    for fix in fix_result['fixes_applied']:
                        print(f"  - {fix}")
    
    print("\n✅ Analysis complete!")

if __name__ == "__main__":
    main()
