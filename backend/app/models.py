from sqlalchemy import Column, String, Text, DateTime, Boolean, Integer, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime

from .database import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    role = Column(String(50), default="tester")  # "admin", "tester"
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    conversations = relationship("Conversation", back_populates="user", cascade="all, delete-orphan")

class Conversation(Base):
    __tablename__ = "conversations"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)  # Updated from owner_id
    folder_id = Column(String(36), ForeignKey("folders.id"), nullable=True)
    color = Column(String(7), nullable=True)
    position = Column(Integer, default=0)
    
    # Relationships
    user = relationship("User", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")
    branches = relationship("Branch", back_populates="conversation", cascade="all, delete-orphan")

class Folder(Base):
    __tablename__ = "folders"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    name = Column(String(255), nullable=False)
    color = Column(String(7), default="#667eea")
    position = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")

class Message(Base):
    __tablename__ = "messages"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id = Column(String(36), ForeignKey("conversations.id"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)  # Added for data isolation
    parent_id = Column(String(36), ForeignKey("messages.id"), nullable=True)
    content = Column(Text, nullable=False)
    role = Column(String(20), nullable=False)  # 'user', 'assistant', 'system'
    llm_provider = Column(String(50), nullable=True)
    llm_model = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    branch_name = Column(String(100), default="main")
    is_active = Column(Boolean, default=True)
    is_summary = Column(Boolean, default=False)
    
    # Relationships
    user = relationship("User")
    conversation = relationship("Conversation", back_populates="messages")
    parent = relationship("Message", remote_side=[id], backref="children")

class Branch(Base):
    __tablename__ = "branches"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id = Column(String(36), ForeignKey("conversations.id"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)  # Added for data isolation
    name = Column(String(100), nullable=False)
    created_from_message_id = Column(String(36), ForeignKey("messages.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    color = Column(String(7), default="#3B82F6")  # hex color for UI
    is_active = Column(Boolean, default=True)
    rating = Column(Integer, default=0)  # 0-5 stars
    
    # Relationships
    user = relationship("User")
    conversation = relationship("Conversation", back_populates="branches")
    created_from_message = relationship("Message")
