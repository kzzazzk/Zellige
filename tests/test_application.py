"""Application contracts exercised directly, without HTTP requests."""

import tempfile
import unittest
from dataclasses import replace
from pathlib import Path

from zellige.adapter.persistence.sqlite.database import Database
from zellige.adapter.persistence.sqlite.sqlite_unit_of_work import (
    SQLiteUnitOfWork,
)
from zellige.adapter.storage.file_blob_store import FileBlobStore
from zellige.application.port.persistence.persistence_conflict import (
    PersistenceConflict,
)
from zellige.application.usecase.branch import AppendItem
from zellige.application.usecase.conversation import (
    CreateConversation,
    UpdateConversation,
)
from zellige.application.usecase.run import CreateRun
from zellige.application.usecase.runtime_profile import (
    CreateRuntimeProfile,
)
from zellige.config.zellige_configuration import ZelligeConfiguration
from zellige.domain.exception.domain_error import DomainError


class ApplicationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        self.database = Database(
            root / "test.sqlite3",
            Path(__file__).resolve().parents[1] / "db" / "migrations",
        )
        self.unit_of_work = SQLiteUnitOfWork(self.database, lambda: 123)
        self.core = ZelligeConfiguration.use_cases(
            self.unit_of_work, FileBlobStore(root / "blobs"), lambda: 123
        )
        self.created = self.core.conversations.create(
            CreateConversation(id="c", branch_id="b")
        )

    def append(self, text, head=None):
        return self.core.branches.append(
            "c",
            "b",
            AppendItem(
                expected_head_item_id=head,
                kind="message",
                payload={
                    "type": "message",
                    "role": "user",
                    "content": [{"type": "text", "text": text}],
                },
            ),
        )

    def test_typed_round_trip_preserves_history_and_change_data(self):
        item = self.append("hello")
        history = self.core.branches.history("c", "b")
        self.assertEqual(history.items, [item])
        self.assertEqual(history.branch.head_item_id, item.id)
        page = self.core.synchronization.changes(0, 100)
        self.assertEqual(
            [change.entity_type for change in page.changes],
            ["conversation", "branch", "item", "branch", "conversation"],
        )
        self.assertEqual(page.changes[2].data["payload"], item.payload)
        self.assertEqual(page.next_cursor, page.changes[-1].seq)
        self.assertFalse(page.has_more)

    def test_change_feed_publishes_the_documented_fields_at_clock_time(self):
        profile = self.core.profiles.create(
            CreateRuntimeProfile(name="profile", definition={})
        )
        self.core.runs.create(
            CreateRun(
                conversation_id="c",
                branch_id="b",
                runtime_profile_version_id=profile.version.id,
            )
        )
        self.append("hello")
        self.core.artifacts.put(b"bytes", "text/plain")
        changes = self.core.synchronization.changes(0, 100).changes
        published = {change.entity_type: set(change.data) for change in changes}
        entity = {"id", "created_at"}
        self.assertEqual(
            published,
            {
                "conversation": entity
                | {"title", "updated_at", "deleted_at", "archived_at"},
                "branch": entity
                | {"conversation_id", "name", "head_item_id", "updated_at"},
                "runtime_profile": entity | {"name", "description"},
                "runtime_profile_version": entity
                | {"runtime_profile_id", "version", "definition"},
                "run": entity
                | {
                    "conversation_id",
                    "branch_id",
                    "input_head_item_id",
                    "runtime_profile_version_id",
                    "provider_session_id",
                    "status",
                    "request",
                    "result",
                    "started_at",
                    "completed_at",
                },
                "item": entity
                | {
                    "conversation_id",
                    "parent_item_id",
                    "run_id",
                    "kind",
                    "payload_schema_version",
                    "payload",
                },
                "artifact": entity
                | {"sha256", "size_bytes", "media_type", "storage_key"},
            },
        )
        self.assertEqual({change.changed_at for change in changes}, {123})

    def test_unarchive_false_is_a_change_and_stale_command_is_rejected(self):
        archived = self.core.conversations.update(
            "c",
            UpdateConversation(
                expected_updated_at=self.created.conversation.updated_at,
                archived=True,
            ),
        )
        restored = self.core.conversations.update(
            "c",
            UpdateConversation(
                expected_updated_at=archived.updated_at,
                archived=False,
            ),
        )
        self.assertIsNone(restored.archived_at)
        self.assertIsNotNone(archived.archived_at)
        self.assertEqual(self.core.conversations.get("c"), restored)
        cursor = self.core.synchronization.changes(0, 100).next_cursor
        with self.assertRaises(DomainError) as caught:
            self.core.conversations.update(
                "c",
                UpdateConversation(
                    expected_updated_at=archived.updated_at,
                    title="Stale title",
                ),
            )
        self.assertEqual(caught.exception.code, "conversation_conflict")
        self.assertEqual(self.core.synchronization.changes(cursor, 100).changes, [])

    def test_run_pins_its_input_before_a_later_append(self):
        profile = self.core.profiles.create(
            CreateRuntimeProfile(name="worker", definition={"mode": "code"})
        )
        item = self.append("original input")
        run = self.core.runs.create(
            CreateRun(
                conversation_id="c",
                branch_id="b",
                runtime_profile_version_id=profile.version.id,
                request={"prompt": "review"},
            )
        )
        self.append("later input", item.id)
        stored = self.core.runs.list("c").runs[0]
        self.assertEqual(stored, run)
        self.assertEqual(stored.input_head_item_id, item.id)
        self.assertEqual(self.core.profiles.list().profiles, [profile])
        run_change = next(
            change
            for change in self.core.synchronization.changes(0, 100).changes
            if change.entity_id == run.id
        )
        self.assertEqual(run_change.data["input_head_item_id"], item.id)

    def test_invalid_item_rolls_back_typed_models_and_events(self):
        cursor = self.core.synchronization.changes(0, 100).next_cursor
        with self.assertRaises(DomainError) as caught:
            self.core.branches.append(
                "c",
                "b",
                AppendItem(
                    expected_head_item_id=None,
                    kind="artifact",
                    payload={
                        "type": "artifact",
                        "artifact_id": "missing",
                        "label": "Missing file",
                    },
                ),
            )
        self.assertEqual(caught.exception.code, "invalid_item")
        self.assertEqual(self.core.branches.history("c", "b").items, [])
        self.assertEqual(self.core.conversations.get("c"), self.created.conversation)
        self.assertEqual(self.core.synchronization.changes(cursor, 100).changes, [])

    def test_late_append_failure_rolls_back_all_repositories_and_events(self):
        cursor = self.core.synchronization.changes(0, 100).next_cursor
        with self.database.transaction() as connection:
            connection.execute(
                """CREATE TRIGGER fail_conversation_update
                   BEFORE UPDATE ON conversations
                   BEGIN SELECT RAISE(ABORT, 'injected final write failure'); END"""
            )

        with self.assertRaises(DomainError) as caught:
            self.append("must roll back")
        self.assertEqual(caught.exception.code, "invalid_item")
        history = self.core.branches.history("c", "b")
        self.assertEqual(history.branch, self.created.branch)
        self.assertEqual(history.items, [])
        self.assertEqual(self.core.conversations.get("c"), self.created.conversation)
        self.assertEqual(self.core.synchronization.changes(cursor, 100).changes, [])
        with self.database.transaction() as connection:
            self.assertEqual(
                connection.execute("SELECT count(*) FROM items").fetchone()[0], 0
            )

    def test_deferred_constraint_failure_rolls_back_at_commit(self):
        cursor = self.core.synchronization.changes(0, 100).next_cursor
        invalid_branch = replace(
            self.created.branch, id="invalid", name="invalid", head_item_id="missing"
        )
        reached_commit = False
        with (
            self.assertRaises(PersistenceConflict),
            self.unit_of_work.write() as repositories,
        ):
            repositories.conversations.save(
                replace(self.created.conversation, title="must roll back")
            )
            repositories.branches.add(invalid_branch)
            self.assertEqual(
                repositories.branches.find_by_id("c", "invalid"), invalid_branch
            )
            reached_commit = True
        self.assertTrue(reached_commit)
        self.assertEqual(self.core.conversations.get("c"), self.created.conversation)
        self.assertEqual(self.core.branches.list("c").branches, [self.created.branch])
        self.assertEqual(self.core.synchronization.changes(cursor, 100).changes, [])

    def test_read_repositories_keep_one_snapshot_while_another_operation_writes(self):
        with self.unit_of_work.read() as reader:
            before = reader.conversations.find_by_id("c")
            self.assertEqual(before, self.created.conversation)
            changed = self.core.conversations.update(
                "c",
                UpdateConversation(
                    expected_updated_at=self.created.conversation.updated_at,
                    title="New title",
                ),
            )
            self.assertEqual(reader.conversations.find_by_id("c"), before)
        self.assertEqual(self.core.conversations.get("c"), changed)
