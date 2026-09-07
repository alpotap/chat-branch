import { useState, useCallback } from 'react';

interface Message {
  id: string;
  content: string;
  role: string;
  branch_name: string;
  llm_model?: string;
  created_at: string;
  is_summary?: boolean;
  children: Message[];
}

export const useBranchMessages = (
  messages: { [key: string]: Message } | null,
  rootMessages: string[],
  currentBranch: string,
  messagesPerPage: number = 20,
  conversationTree?: any  // Add conversationTree to access branch metadata
) => {
  const [showAllMessages, setShowAllMessages] = useState(false);

  const getBranchMessages = useCallback((
    msgs: { [key: string]: Message },
    rootIds: string[],
    branchName: string
  ): Message[] => {
    const parentMap = new Map<string, string>();
    Object.values(msgs).forEach(msg => {
      msg.children.forEach(child => {
        parentMap.set(child.id, msg.id);
      });
    });
    
    const branchMessages = Object.values(msgs).filter(msg => msg.branch_name === branchName);
    
    const sortedBranchMessages = branchMessages.sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    
    const conversationPath: Message[] = [];
    
    if (branchName !== 'main') {
      // Try to find the branch point through child relationships
      let branchPoint: Message | null = Object.values(msgs).find(msg => {
        return msg.children.some(child => 
          msgs[child.id]?.branch_name === branchName
        );
      }) || null;
      
      // If no branch point found through children, try using branch metadata
      if (!branchPoint && conversationTree?.branches) {
        const branchInfo = conversationTree.branches.find((b: any) => b.name === branchName);
        if (branchInfo && branchInfo.created_from_message_id) {
          branchPoint = msgs[branchInfo.created_from_message_id] || null;
        }
      }
      
      if (branchPoint) {
        const pathToRoot: Message[] = [];
        let currentMsg: Message | null = branchPoint;
        
        while (currentMsg) {
          pathToRoot.unshift(currentMsg);
          const parentId = parentMap.get(currentMsg.id);
          currentMsg = parentId ? msgs[parentId] : null;
        }
        
        conversationPath.push(...pathToRoot);
      }
    }
    
    // Add branch messages if they exist
    conversationPath.push(...sortedBranchMessages);
    
    const uniqueMessages = conversationPath.filter((msg, index, arr) => 
      arr.findIndex(m => m.id === msg.id) === index
    );
    
    return uniqueMessages.sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, [conversationTree]);

  const allBranchMessages = messages 
    ? getBranchMessages(messages, rootMessages, currentBranch)
    : [];
  
  const currentBranchMessages = showAllMessages 
    ? allBranchMessages 
    : allBranchMessages.slice(-messagesPerPage);

  const paginatedMessages = showAllMessages 
    ? currentBranchMessages 
    : currentBranchMessages.slice(0, messagesPerPage);

  return {
    allBranchMessages,
    currentBranchMessages,
    paginatedMessages,
    showAllMessages,
    setShowAllMessages
  };
};
