from sqlalchemy import Column, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime

from .database import Base

class Conversation(Base):
    __tablename__ = "conversations"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    owner_id = Column(UUID(as_uuid=True), nullable=True)  # For future multi-user support
    
    # Relationships
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")
    branches = relationship("Branch", back_populates="conversation", cascade="all, delete-orphan")

class Message(Base):
    __tablename__ = "messages"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id"), nullable=False)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("messages.id"), nullable=True)
    content = Column(Text, nullable=False)
    role = Column(String(20), nullable=False)  # 'user', 'assistant', 'system'
    llm_provider = Column(String(50), nullable=True)
    llm_model = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    branch_name = Column(String(100), default="main")
    is_active = Column(Boolean, default=True)
    
    # Relationships
    conversation = relationship("Conversation", back_populates="messages")
    parent = relationship("Message", remote_side=[id], backref="children")

class Branch(Base):
    __tablename__ = "branches"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id"), nullable=False)
    name = Column(String(100), nullable=False)
    created_from_message_id = Column(UUID(as_uuid=True), ForeignKey("messages.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    color = Column(String(7), default="#3B82F6")  # hex color for UI
    
    # Relationships
    conversation = relationship("Conversation", back_populates="branches")
    created_from_message = relationship("Message")
