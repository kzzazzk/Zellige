"""The conversation rules on their own: no database, no HTTP."""
import unittest

from zellige.domain.conversations import ancestry, artifact_links, bump, check_head, revise_conversation
from zellige.domain.errors import DomainError
from zellige.domain.payloads import validate_payload

CONVERSATION = {"id": "c", "title": "Old", "created_at": 1, "updated_at": 10, "deleted_at": None, "archived_at": None}


class DomainRules(unittest.TestCase):
    def assertFails(self, kind: str, code: str, rule, *args):
        with self.assertRaises(DomainError) as caught:
            rule(*args)
        self.assertEqual((caught.exception.kind, caught.exception.code), (kind, code))

    def test_versions_always_advance(self):
        self.assertEqual(bump(10, 50), 50)
        self.assertEqual(bump(10, 3), 11)  # clock moved backwards

    def test_stale_head_is_a_conflict(self):
        check_head("a", "a")
        self.assertFails("conflict", "head_conflict", check_head, "a", "b")

    def test_revising_a_conversation(self):
        revised = revise_conversation(CONVERSATION, {"expected_updated_at": 10, "title": "New", "archived": True}, 5)
        self.assertEqual((revised["title"], revised["updated_at"], revised["archived_at"]), ("New", 11, 11))
        self.assertFails("conflict", "conversation_conflict", revise_conversation, CONVERSATION, {"expected_updated_at": 9, "title": "New"}, 50)
        self.assertFails("invalid", "invalid_request", revise_conversation, CONVERSATION, {"expected_updated_at": 10}, 50)

    def test_artifact_links_come_from_the_payload(self):
        payload = {"type": "message", "content": [
            {"type": "text", "text": "hi"}, {"type": "image", "artifact_id": "a1"},
        ]}
        self.assertEqual(artifact_links(payload), [("a1", "image", 1)])
        self.assertEqual(artifact_links({"type": "artifact", "artifact_id": "a2"}), [("a2", "primary", 0)])

    def test_ancestry_walks_parents_and_detects_damage(self):
        items = {"1": {"id": "1", "parent_item_id": None}, "2": {"id": "2", "parent_item_id": "1"}}
        self.assertEqual([item["id"] for item in ancestry("2", items.get)], ["1", "2"])
        self.assertFails("internal", "broken_history", ancestry, "3", items.get)
        loop = {"x": {"id": "x", "parent_item_id": "y"}, "y": {"id": "y", "parent_item_id": "x"}}
        self.assertFails("internal", "history_cycle", ancestry, "x", loop.get)

    def test_payloads_are_validated_against_the_schema(self):
        message = {"type": "message", "role": "user", "content": [{"type": "text", "text": "hi"}]}
        self.assertEqual(validate_payload("message", message, 1)["role"], "user")
        self.assertFails("invalid", "invalid_payload", validate_payload, "tool_call", message, 1)
        self.assertFails("invalid", "invalid_payload", validate_payload, "message", message, 2)


if __name__ == "__main__":
    unittest.main()
