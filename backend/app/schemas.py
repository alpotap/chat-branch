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
    folder_id: Optional[str] = None
    color: Optional[str] = None
    position: int = 0

    class Config:
        from_attributes = True
    
    @field_validator('id', mode='before')
    @classmethod
    def convert_id_to_string(cls, v: Union[str, uuid.UUID]) -> str:
        return str(v) if isinstance(v, uuid.UUID) else v

# Folder schemas
class FolderCreate(BaseModel):
    name: str
    color: Optional[str] = "#667eea"

class FolderUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    position: Optional[int] = None

class FolderResponse(BaseModel):
    id: str
    name: str
    color: str
    position: int = 0
    created_at: datetime

    class Config:
        from_attributes = True

    @field_validator('id', mode='before')
    @classmethod
    def convert_id_to_string(cls, v: Union[str, uuid.UUID]) -> str:
        return str(v) if isinstance(v, uuid.UUID) else v

class ConversationOrganize(BaseModel):
    folder_id: Optional[str] = None
    color: Optional[str] = None
    position: Optional[int] = None

class SidebarOrderItem(BaseModel):
    id: str
    position: int
    folder_id: Optional[str] = None

class SidebarOrder(BaseModel):
    folders: List[SidebarOrderItem] = []
    conversations: List[SidebarOrderItem] = []

# Message schemas
class MessageCreate(BaseModel):
    content: str
    role: str  # 'user', 'assistant', 'system'
    parent_id: Optional[str] = None
    branch_name: Optional[str] = "main"
    llm_model: Optional[str] = None
    # Optional client-supplied API key for per-request LLM calls (client-only storage)
    client_api_key: Optional[str] = None
    # Optional custom provider override (client-only config): 'openai_compatible' | 'claude_compatible'
    provider_type: Optional[str] = None
    provider_base_url: Optional[str] = None

class MessageResponse(BaseModel):
    id: str
    content: str
    role: str
    parent_id: Optional[str]
    branch_name: str
    llm_model: Optional[str]
    created_at: datetime
    is_summary: bool = False

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
    rating: int = 0

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
    is_summary: bool = False
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

# Note-taking schemas
class NoteFolderCreate(BaseModel):
    name: str
    color: Optional[str] = "#667eea"

class NoteFolderUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    position: Optional[int] = None

class NoteFolderResponse(BaseModel):
    id: str
    name: str
    color: str
    position: int = 0
    created_at: datetime

    class Config:
        from_attributes = True

    @field_validator('id', mode='before')
    @classmethod
    def convert_id_to_string(cls, v: Union[str, uuid.UUID]) -> str:
        return str(v) if isinstance(v, uuid.UUID) else v

class NoteCreate(BaseModel):
    title: str
    folder_id: Optional[str] = None

class NoteResponse(BaseModel):
    id: str
    title: str
    folder_id: Optional[str] = None
    color: Optional[str] = None
    position: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

    @field_validator('id', mode='before')
    @classmethod
    def convert_id_to_string(cls, v: Union[str, uuid.UUID]) -> str:
        return str(v) if isinstance(v, uuid.UUID) else v

class NoteOrganize(BaseModel):
    folder_id: Optional[str] = None
    color: Optional[str] = None
    position: Optional[int] = None

class NotesSidebarOrderItem(BaseModel):
    id: str
    position: int
    folder_id: Optional[str] = None

class NotesSidebarOrder(BaseModel):
    folders: List[NotesSidebarOrderItem] = []
    notes: List[NotesSidebarOrderItem] = []

class NoteTextCreate(BaseModel):
    content: str
    source_type: Optional[str] = "manual"
    source_conversation_id: Optional[str] = None
    source_message_id: Optional[str] = None
    source_branch_name: Optional[str] = None
    source_label: Optional[str] = None

class NoteTextUpdate(BaseModel):
    content: str

class NoteTextResponse(BaseModel):
    id: str
    note_id: str
    content: str
    position: int = 0
    created_at: datetime
    updated_at: datetime
    source_type: str = "manual"
    source_conversation_id: Optional[str] = None
    source_message_id: Optional[str] = None
    source_branch_name: Optional[str] = None
    source_label: Optional[str] = None

    class Config:
        from_attributes = True

    @field_validator('id', 'note_id', 'source_conversation_id', 'source_message_id', mode='before')
    @classmethod
    def convert_id_to_string(cls, v: Union[str, uuid.UUID, None]) -> Optional[str]:
        if v is None:
            return None
        return str(v) if isinstance(v, uuid.UUID) else v

class NoteTextReorderItem(BaseModel):
    id: str
    position: int

class NoteTextReorder(BaseModel):
    items: List[NoteTextReorderItem] = []

class NoteWithTexts(NoteResponse):
    texts: List[NoteTextResponse] = []

class SaveMessageToNote(BaseModel):
    note_id: str
    content: str
    source_label: Optional[str] = None

# Update forward references
MessageNode.model_rebuild()

