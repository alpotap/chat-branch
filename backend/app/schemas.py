from pydantic import BaseModel, field_validator
from typing import List, Optional, Dict, Any, Union
from datetime import datetime
import uuid

# Conversation schemas
class ConversationCreate(BaseModel):
    title: str

class ConversationResponse(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
    
    @field_validator('id', mode='before')
    @classmethod
    def convert_id_to_string(cls, v: Union[str, uuid.UUID]) -> str:
        return str(v) if isinstance(v, uuid.UUID) else v

# Message schemas
class MessageCreate(BaseModel):
    content: str
    role: str  # 'user', 'assistant', 'system'
    parent_id: Optional[str] = None
    branch_name: Optional[str] = "main"
    llm_model: Optional[str] = None
    # Optional client-supplied API key for per-request LLM calls (client-only storage)
    client_api_key: Optional[str] = None

class MessageResponse(BaseModel):
    id: str
    content: str
    role: str
    parent_id: Optional[str]
    branch_name: str
    llm_model: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True
    
    @field_validator('id', 'parent_id', mode='before')
    @classmethod
    def convert_id_to_string(cls, v: Union[str, uuid.UUID, None]) -> Optional[str]:
        if v is None:
            return None
        return str(v) if isinstance(v, uuid.UUID) else v

# Branch schemas
class BranchCreate(BaseModel):
    name: str
    created_from_message_id: str
    color: Optional[str] = "#3B82F6"

class BranchResponse(BaseModel):
    id: str
    name: str
    created_from_message_id: str
    created_at: datetime
    color: str

    class Config:
        from_attributes = True
    
    @field_validator('id', 'created_from_message_id', mode='before')
    @classmethod
    def convert_id_to_string(cls, v: Union[str, uuid.UUID]) -> str:
        return str(v) if isinstance(v, uuid.UUID) else v

# Tree structure for frontend
class MessageNode(BaseModel):
    id: str
    content: str
    role: str
    branch_name: str
    llm_model: Optional[str]
    created_at: datetime
    children: List['MessageNode'] = []
    
    @field_validator('id', mode='before')
    @classmethod
    def convert_id_to_string(cls, v: Union[str, uuid.UUID]) -> str:
        return str(v) if isinstance(v, uuid.UUID) else v

class ConversationTree(BaseModel):
    conversation: ConversationResponse
    messages: Dict[str, MessageNode]
    branches: List[BranchResponse]
    root_messages: List[str] = []
    root_messages: List[str]

# Authentication schemas
class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    is_admin: bool
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True
    
    @field_validator('id', mode='before')
    @classmethod
    def convert_id_to_string(cls, v: Union[str, uuid.UUID]) -> str:
        return str(v) if isinstance(v, uuid.UUID) else v

    @classmethod
    def from_orm(cls, obj):
        return cls(
            id=str(obj.id),
            email=obj.email,
            name=obj.name,
            role=obj.role,
            is_admin=(obj.role == "admin"),
            is_active=obj.is_active,
            created_at=obj.created_at
        )

class Token(BaseModel):
    access_token: str
    token_type: str
    expires_in: int

class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    expires_in: int
    user: UserResponse

class TokenData(BaseModel):
    user_id: Optional[str] = None

# Update forward references
MessageNode.model_rebuild()
