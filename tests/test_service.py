from __future__ import annotations

import concurrent.futures
import json
import tempfile
import threading
import unittest
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from zellige.api_models import item_payload_json_schema
from zellige.server import build_app


TOKEN = "test-token"


class APITestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.temporary.name)
        self.app = build_app(self.data_dir, TOKEN)
        self.client = TestClient(self.app)

    def tearDown(self) -> None:
        self.client.close()
        self.temporary.cleanup()

    def request(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | bytes | None = None,
        *,
        content_type: str = "application/json",
    ) -> tuple[int, dict[str, Any]]:
        if isinstance(body, dict):
            response = self.client.request(
                method,
                path,
                json=body,
                headers={"Authorization": f"Bearer {TOKEN}"},
            )
        else:
            response = self.client.request(
                method,
                path,
                content=body,
                headers={
                    "Authorization": f"Bearer {TOKEN}",
                    "Content-Type": content_type,
                },
            )
        return response.status_code, response.json()

    def make_conversation(self) -> tuple[str, str]:
        status, body = self.request("POST", "/v1/conversations", {"title": "Portable chat"})
        self.assertEqual(status, 201)
        return body["conversation"]["id"], body["branch"]["id"]

    def append_message(
        self,
        conversation_id: str,
        branch_id: str,
        expected: str | None,
        text: str,
    ) -> tuple[int, dict[str, Any]]:
        return self.request(
            "POST",
            f"/v1/conversations/{conversation_id}/branches/{branch_id}/items",
            {
                "expected_head_item_id": expected,
                "kind": "message",
                "payload": {
                    "type": "message",
                    "role": "user",
                    "content": [{"type": "text", "text": text}],
                },
            },
        )

    def test_conversation_branch_and_history(self) -> None:
        conversation_id, main_branch_id = self.make_conversation()
        status, first = self.append_message(conversation_id, main_branch_id, None, "root")
        self.assertEqual(status, 201)
        status, branch = self.request(
            "POST",
            f"/v1/conversations/{conversation_id}/branches",
            {"name": "experiment", "head_item_id": first["id"]},
        )
        self.assertEqual(status, 201)
        status, second = self.append_message(conversation_id, branch["id"], first["id"], "branch")
        self.assertEqual(status, 201)
        status, history = self.request(
            "GET", f"/v1/conversations/{conversation_id}/branches/{branch['id']}/history"
        )
        self.assertEqual(status, 200)
        self.assertEqual([item["id"] for item in history["items"]], [first["id"], second["id"]])

    def test_concurrent_writes_have_one_winner(self) -> None:
        conversation_id, branch_id = self.make_conversation()
        barrier = threading.Barrier(2)

        def append(text: str) -> tuple[int, dict[str, Any]]:
            barrier.wait()
            return self.append_message(conversation_id, branch_id, None, text)

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(append, ["one", "two"]))
        self.assertEqual(sorted(status for status, _ in results), [201, 409])
        conflict = next(body for status, body in results if status == 409)
        self.assertEqual(conflict["error"]["code"], "head_conflict")

    def test_runs_use_distinct_profiles_and_versioned_context(self) -> None:
        conversation_id, branch_id = self.make_conversation()
        status, input_item = self.append_message(
            conversation_id, branch_id, None, "run input"
        )
        self.assertEqual(status, 201)
        status, general = self.request(
            "POST", "/v1/runtime-profiles", {"name": "general", "definition": {"mode": "chat"}}
        )
        self.assertEqual(status, 201)
        status, code = self.request(
            "POST", "/v1/runtime-profiles", {"name": "code", "definition": {"mode": "coding"}}
        )
        self.assertEqual(status, 201)
        status, context = self.request(
            "POST", "/v1/context-packs", {"name": "preferences", "manifest": {"entries": ["v1"]}}
        )
        self.assertEqual(status, 201)
        status, context_v2 = self.request(
            "POST",
            f"/v1/context-packs/{context['context_pack']['id']}/versions",
            {"manifest": {"entries": ["v1", "v2"]}},
        )
        self.assertEqual(status, 201)
        self.assertEqual(context_v2["version"], 2)

        run_versions = []
        for profile in (general, code):
            status, run = self.request(
                "POST",
                "/v1/runs",
                {
                    "conversation_id": conversation_id,
                    "branch_id": branch_id,
                    "runtime_profile_version_id": profile["version"]["id"],
                    "context_pack_version_ids": [context_v2["id"]],
                    "request": {"prompt": "same conversation"},
                },
            )
            self.assertEqual(status, 201)
            self.assertEqual(run["input_head_item_id"], input_item["id"])
            self.assertIsInstance(run["created_at"], int)
            self.assertIsNone(run["started_at"])
            run_versions.append(run["runtime_profile_version_id"])
        self.assertEqual(len(set(run_versions)), 2)

    def test_outbox_reconnects_from_cursor(self) -> None:
        conversation_id, branch_id = self.make_conversation()
        status, first_page = self.request("GET", "/v1/changes?cursor=0&limit=1")
        self.assertEqual(status, 200)
        self.assertTrue(first_page["has_more"])
        cursor = first_page["next_cursor"]
        status, item = self.append_message(conversation_id, branch_id, None, "after cursor")
        self.assertEqual(status, 201)
        status, remaining = self.request("GET", f"/v1/changes?cursor={cursor}&limit=100")
        self.assertEqual(status, 200)
        self.assertIn(item["id"], [change["entity_id"] for change in remaining["changes"]])
        branch_change = next(
            change
            for change in reversed(remaining["changes"])
            if change["entity_type"] == "branch" and change["entity_id"] == branch_id
        )
        self.assertEqual(branch_change["data"]["head_item_id"], item["id"])
        self.assertIn("name", branch_change["data"])
        self.assertTrue(
            any(
                change["entity_type"] == "conversation"
                and change["entity_id"] == conversation_id
                for change in remaining["changes"]
            )
        )
        seqs = [change["seq"] for change in remaining["changes"]]
        self.assertEqual(seqs, sorted(seqs))

    def test_restart_preserves_state_and_wal(self) -> None:
        conversation_id, branch_id = self.make_conversation()
        status, item = self.append_message(conversation_id, branch_id, None, "persistent")
        self.assertEqual(status, 201)
        self.client.close()
        self.app = build_app(self.data_dir, TOKEN)
        self.client = TestClient(self.app)
        status, history = self.request(
            "GET", f"/v1/conversations/{conversation_id}/branches/{branch_id}/history"
        )
        self.assertEqual(status, 200)
        self.assertEqual(history["items"][0]["id"], item["id"])
        with self.app.state.service.database.connect() as connection:
            self.assertEqual(connection.execute("PRAGMA journal_mode").fetchone()[0], "wal")
            self.assertEqual(connection.execute("PRAGMA foreign_keys").fetchone()[0], 1)
            self.assertEqual(connection.execute("PRAGMA quick_check").fetchone()[0], "ok")

    def test_artifact_is_content_addressed_outside_sqlite(self) -> None:
        status, artifact = self.request(
            "POST", "/v1/artifacts", b"large-ish content", content_type="text/plain"
        )
        self.assertEqual(status, 201)
        blob = self.data_dir / "blobs" / artifact["storage_key"]
        self.assertEqual(blob.read_bytes(), b"large-ish content")
        conversation_id, branch_id = self.make_conversation()
        status, item = self.request(
            "POST",
            f"/v1/conversations/{conversation_id}/branches/{branch_id}/items",
            {
                "expected_head_item_id": None,
                "kind": "artifact",
                "payload": {
                    "type": "artifact",
                    "artifact_id": artifact["id"],
                    "label": "sample",
                },
            },
        )
        self.assertEqual(status, 201)
        with self.app.state.service.database.connect() as connection:
            link = connection.execute(
                "SELECT artifact_id FROM item_artifacts WHERE item_id = ?", (item["id"],)
            ).fetchone()
        self.assertEqual(link[0], artifact["id"])

    def test_invalid_payload_and_cross_conversation_head_are_rejected(self) -> None:
        first_conversation, first_branch = self.make_conversation()
        second_conversation, _ = self.make_conversation()
        status, item = self.append_message(first_conversation, first_branch, None, "first")
        self.assertEqual(status, 201)
        status, body = self.request(
            "POST",
            f"/v1/conversations/{second_conversation}/branches",
            {"name": "invalid", "head_item_id": item["id"]},
        )
        self.assertEqual(status, 409)
        self.assertEqual(body["error"]["code"], "invalid_branch")
        status, body = self.request(
            "POST",
            f"/v1/conversations/{first_conversation}/branches/{first_branch}/items",
            {"expected_head_item_id": item["id"], "kind": "message", "payload": {"type": "message"}},
        )
        self.assertEqual(status, 400)
        self.assertEqual(body["error"]["code"], "invalid_payload")

    def test_openapi_docs_auth_and_standalone_payload_schema(self) -> None:
        openapi = self.client.get("/openapi.json")
        self.assertEqual(openapi.status_code, 200)
        schema = openapi.json()
        self.assertEqual(schema["openapi"], "3.1.0")
        operation_ids = {
            operation["operationId"]
            for path in schema["paths"].values()
            for method, operation in path.items()
            if method in {"get", "post", "put", "patch", "delete"}
        }
        self.assertEqual(
            operation_ids,
            {
                "getHealth",
                "createConversation",
                "createBranch",
                "appendItem",
                "getBranchHistory",
                "createRuntimeProfile",
                "createContextPack",
                "createContextPackVersion",
                "createRun",
                "getChanges",
                "putArtifact",
            },
        )
        self.assertEqual(
            schema["components"]["securitySchemes"]["BearerAuth"]["scheme"], "bearer"
        )
        self.assertIn("BearerAuth", schema["paths"]["/v1/conversations"]["post"]["security"][0])
        for path in schema["paths"].values():
            for method, operation in path.items():
                if method in {"get", "post", "put", "patch", "delete"}:
                    self.assertNotIn("422", operation["responses"])
        self.assertEqual(self.client.get("/docs").status_code, 200)
        self.assertEqual(self.client.get("/redoc").status_code, 200)

        unauthorized = self.client.get("/v1/changes")
        self.assertEqual(unauthorized.status_code, 401)
        self.assertEqual(unauthorized.json()["error"]["code"], "unauthorized")

        oversized = self.client.post(
            "/v1/conversations",
            content=b"{}",
            headers={
                "Authorization": f"Bearer {TOKEN}",
                "Content-Type": "application/json",
                "Content-Length": str(2 * 1024 * 1024 + 1),
            },
        )
        self.assertEqual(oversized.status_code, 413)
        self.assertEqual(oversized.json()["error"]["code"], "body_too_large")

        checked_in_schema = json.loads(
            (Path(__file__).parents[1] / "schemas" / "item-payload.schema.json").read_text()
        )
        self.assertEqual(checked_in_schema, item_payload_json_schema())


if __name__ == "__main__":
    unittest.main()
