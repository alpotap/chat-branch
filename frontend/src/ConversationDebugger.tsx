import React, { useState } from 'react';
import axios from 'axios';

interface DebugInfo {
  conversation_id: string;
  total_messages: number;
  message_details: any[];
  orphaned_messages: any[];
  invalid_parent_refs: any[];
  branches: { [key: string]: string[] };
  root_messages: string[];
}

const ConversationDebugger: React.FC = () => {
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [conversationId, setConversationId] = useState('');
  const [loading, setLoading] = useState(false);

  const API_BASE = 'http://localhost:8001';

  const debugConversation = async () => {
    if (!conversationId.trim()) return;
    
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/conversations/${conversationId}/debug`);
      setDebugInfo(response.data);
    } catch (error) {
      console.error('Error debugging conversation:', error);
      alert('Error debugging conversation. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  const fixConversation = async () => {
    if (!conversationId.trim()) return;
    
    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE}/conversations/${conversationId}/fix`);
      alert(`Fixes applied: ${response.data.fixes_applied.join(', ')}`);
      // Refresh debug info
      await debugConversation();
    } catch (error) {
      console.error('Error fixing conversation:', error);
      alert('Error fixing conversation. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h2>🔍 Conversation Debugger</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Conversation ID"
          value={conversationId}
          onChange={(e) => setConversationId(e.target.value)}
          style={{ width: '300px', marginRight: '10px', padding: '5px' }}
          autoComplete="off"
          data-1p-ignore="true"
          data-lpignore="true"
        />
        <button onClick={debugConversation} disabled={loading}>
          {loading ? 'Debugging...' : 'Debug'}
        </button>
        {debugInfo && (
          <button onClick={fixConversation} disabled={loading} style={{ marginLeft: '10px' }}>
            Fix Issues
          </button>
        )}
      </div>

      {debugInfo && (
        <div>
          <h3>📊 Debug Results</h3>
          <div style={{ backgroundColor: '#f5f5f5', padding: '15px', borderRadius: '5px' }}>
            <p><strong>Conversation ID:</strong> {debugInfo.conversation_id}</p>
            <p><strong>Total Messages:</strong> {debugInfo.total_messages}</p>
            <p><strong>Root Messages:</strong> {debugInfo.root_messages.length}</p>
            <p><strong>Invalid Parent Refs:</strong> {debugInfo.invalid_parent_refs.length}</p>
            <p><strong>Orphaned Messages:</strong> {debugInfo.orphaned_messages.length}</p>
          </div>

          <h4>🌿 Branches</h4>
          <div style={{ backgroundColor: '#e8f5e8', padding: '10px', borderRadius: '5px' }}>
            {Object.entries(debugInfo.branches).map(([branchName, messageIds]) => (
              <p key={branchName}>
                <strong>{branchName}:</strong> {messageIds.length} messages
              </p>
            ))}
          </div>

          {debugInfo.invalid_parent_refs.length > 0 && (
            <>
              <h4>⚠️ Invalid Parent References</h4>
              <div style={{ backgroundColor: '#ffe8e8', padding: '10px', borderRadius: '5px' }}>
                {debugInfo.invalid_parent_refs.map((msg, index) => (
                  <p key={index}>
                    Message {msg.id}: references non-existent parent {msg.parent_id}
                  </p>
                ))}
              </div>
            </>
          )}

          {debugInfo.orphaned_messages.length > 0 && (
            <>
              <h4>🏝️ Orphaned Messages</h4>
              <div style={{ backgroundColor: '#fff8e8', padding: '10px', borderRadius: '5px' }}>
                {debugInfo.orphaned_messages.map((msg, index) => (
                  <p key={index}>
                    Message {msg.id}: {msg.reason}
                  </p>
                ))}
              </div>
            </>
          )}

          <h4>📝 All Messages</h4>
          <div style={{ backgroundColor: '#f0f8ff', padding: '10px', borderRadius: '5px', maxHeight: '300px', overflowY: 'scroll' }}>
            {debugInfo.message_details.map((msg, index) => (
              <div key={index} style={{ 
                marginBottom: '10px', 
                padding: '5px', 
                backgroundColor: msg.has_valid_parent ? '#ffffff' : '#ffeeee',
                border: '1px solid #ddd',
                borderRadius: '3px'
              }}>
                <p><strong>ID:</strong> {msg.id}</p>
                <p><strong>Role:</strong> {msg.role}</p>
                <p><strong>Branch:</strong> {msg.branch_name}</p>
                <p><strong>Parent ID:</strong> {msg.parent_id || 'None (root)'}</p>
                <p><strong>Content:</strong> {msg.content_preview}</p>
                {!msg.has_valid_parent && (
                  <p style={{ color: 'red' }}><strong>❌ Invalid parent reference!</strong></p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ConversationDebugger;
