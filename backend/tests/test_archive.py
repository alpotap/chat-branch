from datetime import datetime, timezone

from app.services import ConversationService, NoteService, SearchService
from app.models import User, Conversation, Folder, Note, NoteFolder


def create_user(db, email="archive@example.com"):
    user = User(email=email, password_hash="hash", name="Archive Tester")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_archive_and_restore_conversation_to_original_folder(db_session):
    svc = ConversationService()
    user = create_user(db_session)
    folder = svc.create_folder(db_session, user.id, "Work")
    conv = svc.create_conversation(db_session, ConversationCreateStub("Chat A"), user.id)
    conv.folder_id = folder.id
    db_session.commit()

    assert svc.archive_conversation(db_session, conv.id, user.id) is True
    db_session.refresh(conv)
    assert conv.is_archived is True
    assert conv.archived_at is not None
    assert conv.id not in [c.id for c in svc.list_conversations(db_session, user.id)]
    assert conv.id in [c.id for c in svc.list_archived_conversations(db_session, user.id)]

    assert svc.restore_conversation(db_session, conv.id, user.id) is True
    db_session.refresh(conv)
    assert conv.is_archived is False
    assert conv.archived_at is None
    assert conv.folder_id == folder.id


def test_restore_conversation_falls_back_to_root_when_folder_archived(db_session):
    svc = ConversationService()
    user = create_user(db_session, email="u2@example.com")
    folder = svc.create_folder(db_session, user.id, "Temp")
    conv = svc.create_conversation(db_session, ConversationCreateStub("Chat B"), user.id)
    conv.folder_id = folder.id
    db_session.commit()

    svc.archive_conversation(db_session, conv.id, user.id)
    svc.archive_folder(db_session, folder.id, user.id)
    svc.restore_conversation(db_session, conv.id, user.id)
    db_session.refresh(conv)
    assert conv.folder_id is None


def test_archive_folder_cascades_to_child_conversations(db_session):
    svc = ConversationService()
    user = create_user(db_session, email="u3@example.com")
    folder = svc.create_folder(db_session, user.id, "Project")
    conv1 = svc.create_conversation(db_session, ConversationCreateStub("Chat C1"), user.id)
    conv2 = svc.create_conversation(db_session, ConversationCreateStub("Chat C2"), user.id)
    conv1.folder_id = folder.id
    conv2.folder_id = folder.id
    db_session.commit()

    assert svc.archive_folder(db_session, folder.id, user.id) is True
    db_session.refresh(folder)
    db_session.refresh(conv1)
    db_session.refresh(conv2)
    assert folder.is_archived is True
    assert conv1.is_archived is True
    assert conv2.is_archived is True
    assert folder.id not in [f.id for f in svc.list_folders(db_session, user.id)]


def test_archive_and_restore_note(db_session):
    svc = NoteService()
    user = create_user(db_session, email="u4@example.com")
    note = svc.create_note(db_session, user.id, "My Note")

    assert svc.archive_note(db_session, note.id, user.id) is True
    db_session.refresh(note)
    assert note.is_archived is True
    assert note.id not in [n.id for n in svc.list_notes(db_session, user.id)]
    assert note.id in [n.id for n in svc.list_archived_notes(db_session, user.id)]

    assert svc.restore_note(db_session, note.id, user.id) is True
    db_session.refresh(note)
    assert note.is_archived is False


def test_search_includes_archived_results_after_live_ones(db_session):
    conv_svc = ConversationService()
    user = create_user(db_session, email="u5@example.com")
    live = conv_svc.create_conversation(db_session, ConversationCreateStub("Widget Live"), user.id)
    archived = conv_svc.create_conversation(db_session, ConversationCreateStub("Widget Archived"), user.id)
    conv_svc.archive_conversation(db_session, archived.id, user.id)

    results = SearchService().search(db_session, user.id, "widget")
    assert len(results) == 2
    assert results[0]["conversation_id"] == live.id
    assert results[0]["is_archived"] is False
    assert results[1]["conversation_id"] == archived.id
    assert results[1]["is_archived"] is True


class ConversationCreateStub:
    """Minimal stand-in for schemas.ConversationCreate to avoid extra imports."""
    def __init__(self, title):
        self.title = title
