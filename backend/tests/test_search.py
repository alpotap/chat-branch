from datetime import datetime, timezone

from app.models import Conversation, Message, Note, NoteText, User
from app.services import SearchService


def create_user(db, email):
    user = User(email=email, password_hash="hash", name="Test User")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_search_returns_notes_chats_and_navigation_metadata(db_session):
    user = create_user(db_session, "search@example.com")
    conversation = Conversation(
        title="Project Chat",
        user_id=user.id,
        created_at=datetime.now(timezone.utc),
    )
    note = Note(user_id=user.id, title="Project Notes")
    db_session.add_all([conversation, note])
    db_session.commit()

    note_text = NoteText(
        note_id=note.id,
        user_id=user.id,
        content="Remember the project table formatting",
        source_type="manual",
    )
    message = Message(
        conversation_id=conversation.id,
        user_id=user.id,
        content="The project response contains the final table",
        role="assistant",
        branch_name="main",
        created_at=datetime.now(timezone.utc),
    )
    db_session.add_all([note_text, message])
    db_session.commit()

    results = SearchService().search(db_session, user.id, "project")

    assert {result["result_type"] for result in results} == {"note", "chat"}
    note_result = next(result for result in results if result["match_type"] == "note_title")
    assert note_result["note_id"] == note.id
    assert note_result["note_title"] == "Project Notes"
    message_result = next(result for result in results if result["match_type"] == "message")
    assert message_result["conversation_id"] == conversation.id
    assert message_result["message_id"] == message.id
    assert message_result["branch_name"] == "main"


def test_search_excludes_inactive_and_other_users(db_session):
    user = create_user(db_session, "owner@example.com")
    other_user = create_user(db_session, "other@example.com")
    conversation = Conversation(
        title="Owner conversation",
        user_id=user.id,
        created_at=datetime.now(timezone.utc),
    )
    db_session.add(conversation)
    db_session.commit()

    inactive = Message(
        conversation_id=conversation.id,
        user_id=user.id,
        content="secret project result",
        role="assistant",
        branch_name="main",
        is_active=False,
        created_at=datetime.now(timezone.utc),
    )
    other_conversation = Conversation(
        title="Other conversation",
        user_id=other_user.id,
        created_at=datetime.now(timezone.utc),
    )
    db_session.add_all([inactive, other_conversation])
    db_session.commit()
    db_session.add(Message(
        conversation_id=other_conversation.id,
        user_id=other_user.id,
        content="secret project result",
        role="assistant",
        branch_name="main",
        created_at=datetime.now(timezone.utc),
    ))
    db_session.commit()

    results = SearchService().search(db_session, user.id, "secret")

    assert results == []


def test_search_has_minimum_query_and_global_limit(db_session):
    user = create_user(db_session, "limit@example.com")
    for index in range(4):
        db_session.add(Note(user_id=user.id, title=f"Repeated {index}"))
    db_session.commit()

    assert SearchService().search(db_session, user.id, "r") == []
    results = SearchService().search(db_session, user.id, "repeated", limit=2)
    assert len(results) == 2