import pytest
from app.models import User, NoteFolder, Note, NoteItem
from app.schemas import NoteItemCreate
from app.services import NoteService

@pytest.fixture
def note_service():
    return NoteService()

@pytest.fixture
def test_user(db_session):
    user = User(
        email="testnotes@example.com",
        password_hash="fakehash",
        name="Test Notes User"
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

def test_note_folder_crud_and_order(db_session, note_service, test_user):
    # 1. Create folders
    folder1 = note_service.create_folder(db_session, test_user.id, "Work", "#ff0000")
    folder2 = note_service.create_folder(db_session, test_user.id, "Personal", "#00ff00")
    assert folder1.name == "Work"
    assert folder2.name == "Personal"
    
    # 2. List folders
    folders = note_service.list_folders(db_session, test_user.id)
    assert len(folders) == 2
    
    # 3. Update folder
    updated = note_service.update_folder(db_session, folder1.id, test_user.id, name="Work Projects", color="#0000ff")
    assert updated.name == "Work Projects"
    assert updated.color == "#0000ff"
    
    # 4. Create note in folder
    note1 = note_service.create_note(db_session, test_user.id, "Project A", folder_id=folder1.id)
    assert note1.folder_id == folder1.id
    
    # 5. Delete folder (note should move to root, folder_id = None)
    success = note_service.delete_folder(db_session, folder1.id, test_user.id)
    assert success is True
    
    db_session.refresh(note1)
    assert note1.folder_id is None

def test_note_and_item_workflow(db_session, note_service, test_user):
    # 1. Create note
    note = note_service.create_note(db_session, test_user.id, "Research Findings")
    assert note.title == "Research Findings"
    
    # 2. Add manual item
    item1 = note_service.add_note_item(
        db_session,
        note.id,
        test_user.id,
        NoteItemCreate(content="# Key Takeaway 1", source_type="manual")
    )
    assert item1.content == "# Key Takeaway 1"
    assert item1.source_type == "manual"
    assert item1.position == 1

    # 3. Add item from conversation
    item2 = note_service.add_note_item(
        db_session,
        note.id,
        test_user.id,
        NoteItemCreate(
            content="Marketing insight response text",
            source_type="conversation",
            source_conversation_id="conv-123",
            source_conversation_title="Marketing Chat",
            source_branch_name="campaign-ideas",
            source_message_id="msg-456",
            source_message_role="assistant"
        )
    )
    assert item2.source_type == "conversation"
    assert item2.source_conversation_title == "Marketing Chat"
    assert item2.source_branch_name == "campaign-ideas"
    assert item2.position == 2

    # 4. Reorder items (swap positions)
    note_service.reorder_note_items(db_session, note.id, test_user.id, [item2.id, item1.id])
    db_session.refresh(item1)
    db_session.refresh(item2)
    assert item2.position == 0
    assert item1.position == 1

    # 5. Update item content
    updated_item = note_service.update_note_item(db_session, note.id, item1.id, test_user.id, "# Updated Takeaway")
    assert updated_item.content == "# Updated Takeaway"

    # 6. Delete item
    deleted = note_service.delete_note_item(db_session, note.id, item1.id, test_user.id)
    assert deleted is True

    # 7. Delete note
    deleted_note = note_service.delete_note(db_session, note.id, test_user.id)
    assert deleted_note is True
    assert note_service.get_note(db_session, note.id, test_user.id) is None
