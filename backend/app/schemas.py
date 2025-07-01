from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
import uuid

# Conversation schemas
class ConversationCreate(BaseModel):
    title: str

class ConversationResponse(BaseModel):
    id: uuid.UUID
    title: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Message schemas
class MessageCreate(BaseModel):
    content: str
    role: str  # 'user', 'assistant', 'system'
    parent_id: Optional[uuid.UUID] = None
    branch_name: Optional[str] = "main"
    llm_model: Optional[str] = None

class MessageResponse(BaseModel):
    id: uuid.UUID
    content: str
    role: str
    parent_id: Optional[uuid.UUID]
    branch_name: str
    llm_model: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

# Branch schemas
class BranchCreate(BaseModel):
    name: str
    created_from_message_id: uuid.UUID
    color: Optional[str] = "#3B82F6"

class BranchResponse(BaseModel):
    id: uuid.UUID
    name: str
    created_from_message_id: uuid.UUID
    created_at: datetime
    color: str

    class Config:
        from_attributes = True

# Tree structure for frontend
class MessageNode(BaseModel):
    id: uuid.UUID
    content: str
    role: str
    branch_name: str
    llm_model: Optional[str]
    created_at: datetime
    children: List['MessageNode'] = []

class ConversationTree(BaseModel):
    conversation: ConversationResponse
    messages: Dict[str, MessageNode]
    branches: List[BranchResponse]
    root_messages: List[uuid.UUID]

# Update forward references
MessageNode.model_rebuild()
