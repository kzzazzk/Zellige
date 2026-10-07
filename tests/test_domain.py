"""The conversation rules on their own: no database, no HTTP."""

import unittest

from zellige.domain.exception.domain_error import DomainError
from zellige.domain.model.branch import Branch
from zellige.domain.model.conversation import Conversation
from zellige.domain.model.item import Item
from zellige.domain.model.payload import PayloadValidator
from zellige.domain.model.run import Run
from zellige.domain.model.runtime_profile import VersionedRuntimeProfile
from zellige.domain.service.item_history import ItemHistory

CONVERSATION = Conversation(
    id="c", title="Old", created_at=1, updated_at=10, deleted_at=None, archived_at=None
)


class DomainRules(unittest.TestCase):
    def assertFails(self, kind: str, code: str, rule, *args, **kwargs):
        with self.assertRaises(DomainError) as caught:
            rule(*args, **kwargs)
        self.assertEqual((caught.exception.kind, caught.exception.code), (kind, code))

    def test_factories_generate_ids_and_validate_their_input(self):
        conversation = Conversation.create(id=None, title="Chat", now=5)
        self.assertTrue(conversation.id.startswith("conv_"))
        self.assertEqual((conversation.created_at, conversation.updated_at), (5, 5))
        self.assertFails(
            "invalid", "invalid_request", Conversation.create, id=None, title="", now=5
        )

        run = Run.create(
            id="r",
            conversation_id="c",
            branch_id="b",
            input_head_item_id="head",
            runtime_profile_version_id="pv",
            provider_session_id=None,
            request={},
            now=7,
        )
        self.assertEqual((run.status, run.input_head_item_id), ("queued", "head"))
        self.assertFails(
            "invalid",
            "invalid_request",
            Run.create,
            id=None,
            conversation_id="c",
            branch_id="b",
            input_head_item_id=None,
            runtime_profile_version_id="pv",
            provider_session_id=None,
            request="not an object",
            now=7,
        )

    def test_runtime_profiles_start_at_version_one(self):
        profile = VersionedRuntimeProfile.create(
            id=None, version_id=None, name="p", description=None, definition={}, now=1
        )
        self.assertEqual(profile.version.runtime_profile_id, profile.runtime_profile.id)
        self.assertEqual(profile.version.version, 1)
        self.assertFails(
            "invalid",
            "invalid_request",
            VersionedRuntimeProfile.create,
            id=None,
            version_id=None,
            name="",
            description=None,
            definition={},
            now=1,
        )

    def test_versions_always_advance(self):
        self.assertEqual(CONVERSATION.touch(50).updated_at, 50)
        self.assertEqual(CONVERSATION.touch(3).updated_at, 11)  # clock moved backwards

    def test_stale_head_is_a_conflict(self):
        branch = Branch(
            id="b",
            conversation_id="c",
            name="main",
            head_item_id="a",
            created_at=1,
            updated_at=10,
        )
        branch.check_head("a")
        self.assertFails("conflict", "head_conflict", branch.check_head, "b")

    def test_revising_a_conversation(self):
        revised = CONVERSATION.revise(
            expected_updated_at=10, title="New", archived=True, now=5
        )
        self.assertEqual(
            (revised.title, revised.updated_at, revised.archived_at), ("New", 11, 11)
        )
        self.assertFails(
            "conflict",
            "conversation_conflict",
            CONVERSATION.revise,
            expected_updated_at=9,
            title="New",
            now=50,
        )
        self.assertFails(
            "invalid",
            "invalid_request",
            CONVERSATION.revise,
            expected_updated_at=10,
            now=50,
        )

    def test_artifact_links_come_from_the_payload(self):
        payload = {
            "type": "message",
            "content": [
                {"type": "text", "text": "hi"},
                {"type": "image", "artifact_id": "a1"},
            ],
        }
        message = Item(
            id="i1",
            conversation_id="c",
            parent_item_id=None,
            run_id=None,
            kind="message",
            payload_schema_version=1,
            payload=payload,
            created_at=1,
        )
        artifact = Item(
            id="i2",
            conversation_id="c",
            parent_item_id="i1",
            run_id=None,
            kind="artifact",
            payload_schema_version=1,
            payload={"type": "artifact", "artifact_id": "a2"},
            created_at=1,
        )
        self.assertEqual(message.artifact_links(), [("a1", "image", 1)])
        self.assertEqual(artifact.artifact_links(), [("a2", "primary", 0)])

    def test_ancestry_walks_parents_and_detects_damage(self):
        def item(item_id, parent):
            return Item(
                id=item_id,
                parent_item_id=parent,
                conversation_id="c",
                run_id=None,
                kind="message",
                payload_schema_version=1,
                payload={},
                created_at=1,
            )

        items = {"1": item("1", None), "2": item("2", "1")}
        self.assertEqual(
            [item.id for item in ItemHistory.read("2", items.get)], ["1", "2"]
        )
        self.assertFails("internal", "broken_history", ItemHistory.read, "3", items.get)
        loop = {"x": item("x", "y"), "y": item("y", "x")}
        self.assertFails("internal", "history_cycle", ItemHistory.read, "x", loop.get)

    def test_payloads_are_validated_against_the_schema(self):
        message = {
            "type": "message",
            "role": "user",
            "content": [{"type": "text", "text": "hi"}],
        }
        self.assertEqual(
            PayloadValidator.validate("message", message, 1)["role"], "user"
        )
        self.assertFails(
            "invalid",
            "invalid_payload",
            PayloadValidator.validate,
            "tool_call",
            message,
            1,
        )
        self.assertFails(
            "invalid",
            "invalid_payload",
            PayloadValidator.validate,
            "message",
            message,
            2,
        )


if __name__ == "__main__":
    unittest.main()
