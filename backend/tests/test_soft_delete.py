import pytest
from datetime import datetime, timezone

from app.services import ConversationService
from app.models import User, Conversation, Message, Branch


def create_user(db, email="test@example.com"):
    user = User(email=email, password_hash="hash", name="Test User")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_conversation(db, user):
    conv = Conversation(title="Test Conv", user_id=user.id, created_at=datetime.now(timezone.utc))
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


def test_soft_delete_leaf_message(db_session):
    svc = ConversationService()
    # Setup
    user = create_user(db_session)
    conv = create_conversation(db_session, user)

    # Main branch: create user message (parent) and assistant response
    user_msg = Message(conversation_id=conv.id, user_id=user.id, content="Hello", role="user", branch_name="main", created_at=datetime.now(timezone.utc))
    db_session.add(user_msg)
    db_session.flush()
    ai_msg = Message(conversation_id=conv.id, user_id=user.id, content="Hi", role="assistant", parent_id=user_msg.id, branch_name="main", created_at=datetime.now(timezone.utc))
    db_session.add(ai_msg)
    db_session.commit()

    # Deleting the last user message should delete the user+assistant pair when the assistant child
    # is the branch tail (assistant has no active children and is the most recent active message)
    result = svc.soft_delete_last_user_message(db_session, conv.id, str(user_msg.id), user.id)
    assert result["message_id"] == str(user_msg.id)
    assert result["branch_deleted"] is False

    # Verify both messages are now inactive
    db_session.refresh(ai_msg)
    db_session.refresh(user_msg)
    assert ai_msg.is_active is False
    assert user_msg.is_active is False


def test_soft_delete_only_message_deletes_branch(db_session):
    svc = ConversationService()
    user = create_user(db_session, email="u2@example.com")
    conv = create_conversation(db_session, user)

    # Create a branch from a main message
    main_msg = Message(conversation_id=conv.id, user_id=user.id, content="Root", role="user", branch_name="main", created_at=datetime.now(timezone.utc))
    db_session.add(main_msg)
    db_session.flush()

    branch = Branch(conversation_id=conv.id, user_id=user.id, name="feature-x", created_from_message_id=str(main_msg.id), color="#000000")
    db_session.add(branch)
    db_session.flush()

    # Create only one user message in the branch
    branch_msg = Message(conversation_id=conv.id, user_id=user.id, content="Branch start", role="user", branch_name="feature-x", created_at=datetime.now(timezone.utc))
    db_session.add(branch_msg)
    db_session.commit()

    res = svc.soft_delete_last_user_message(db_session, conv.id, str(branch_msg.id), user.id)
    assert res["message_id"] == str(branch_msg.id)
    assert res["branch_deleted"] is True


def test_soft_delete_fails_when_children_exist(db_session):
    svc = ConversationService()
    user = create_user(db_session, email="u3@example.com")
    conv = create_conversation(db_session, user)

    # Create chain: user -> assistant -> user (so first user has children)
    u1 = Message(conversation_id=conv.id, user_id=user.id, content="U1", role="user", branch_name="main", created_at=datetime.now(timezone.utc))
    db_session.add(u1)
    db_session.flush()
    a1 = Message(conversation_id=conv.id, user_id=user.id, content="A1", role="assistant", parent_id=u1.id, branch_name="main", created_at=datetime.now(timezone.utc))
    db_session.add(a1)
    db_session.flush()
    u2 = Message(conversation_id=conv.id, user_id=user.id, content="U2", role="user", parent_id=a1.id, branch_name="main", created_at=datetime.now(timezone.utc))
    db_session.add(u2)
    db_session.commit()

    # Attempt to delete a1 (assistant) - should raise because role != user
    with pytest.raises(ValueError):
        svc.soft_delete_last_user_message(db_session, conv.id, str(a1.id), user.id)

    # Attempt to delete u1 (not a leaf) - should raise
    with pytest.raises(ValueError):
        svc.soft_delete_last_user_message(db_session, conv.id, str(u1.id), user.id)
