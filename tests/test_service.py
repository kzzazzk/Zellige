from __future__ import annotations

import concurrent.futures
import json
import sqlite3
import tempfile
import threading
import unittest
from unittest.mock import patch
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

    def test_conversation_navigation_archive_restore_and_conflicts(self) -> None:
        conversation_id, branch_id = self.make_conversation()
        status, conversation = self.request("GET", f"/v1/conversations/{conversation_id}")
        self.assertEqual(status, 200)
        stale_timestamp = conversation["updated_at"]
        status, renamed = self.request("PATCH", f"/v1/conversations/{conversation_id}", {
            "title": "Renamed chat", "expected_updated_at": stale_timestamp,
        })
        self.assertEqual(status, 200)
        self.assertEqual(renamed["title"], "Renamed chat")
        status, _ = self.request("PATCH", f"/v1/conversations/{conversation_id}", {
            "title": "Stale edit", "expected_updated_at": stale_timestamp,
        })
        self.assertEqual(status, 409)
        status, archived = self.request("PATCH", f"/v1/conversations/{conversation_id}", {
            "archived": True, "expected_updated_at": renamed["updated_at"],
        })
        self.assertEqual(status, 200)
        self.assertIsNotNone(archived["archived_at"])
        self.assertIsNone(archived["deleted_at"])
        self.assertEqual(self.request("GET", "/v1/conversations")[1]["conversations"], [])
        self.assertEqual(len(self.request("GET", "/v1/conversations?archived=true&query=renamed")[1]["conversations"]), 1)
        self.assertEqual(self.request("GET", f"/v1/conversations/{conversation_id}/branches")[1]["branches"][0]["id"], branch_id)
        status, _ = self.append_message(conversation_id, branch_id, None, "History stays writable")
        self.assertEqual(status, 201)
        current = self.request("GET", f"/v1/conversations/{conversation_id}")[1]
        status, restored = self.request("PATCH", f"/v1/conversations/{conversation_id}", {
            "archived": False, "expected_updated_at": current["updated_at"],
        })
        self.assertEqual(status, 200)
        self.assertIsNone(restored["archived_at"])
        changes = self.request("GET", "/v1/changes")[1]["changes"]
        self.assertTrue(any(change["data"].get("archived_at") for change in changes if change["entity_type"] == "conversation"))
        self.assertEqual(self.client.get("/v1/conversations").status_code, 401)
        for body in ({}, {"title": "   "}, {"title": None}):
            status, _ = self.request("PATCH", f"/v1/conversations/{conversation_id}", {"expected_updated_at": restored["updated_at"], **body})
            self.assertEqual(status, 400)
        self.make_conversation()
        page = self.request("GET", "/v1/conversations?limit=1")[1]
        self.assertTrue(page["has_more"])
        second = self.request("GET", "/v1/conversations?limit=1&offset=1")[1]
        self.assertFalse(second["has_more"])
        self.assertNotEqual(page["conversations"][0]["id"], second["conversations"][0]["id"])

    def test_v1_database_upgrades_without_losing_history(self) -> None:
        legacy_dir = self.data_dir / "legacy"
        legacy_dir.mkdir()
        connection = sqlite3.connect(legacy_dir / "zellige.sqlite3")
        migration = Path(__file__).resolve().parents[1] / "migrations" / "001_initial.sql"
        connection.executescript(migration.read_text())
        connection.execute("INSERT INTO schema_migrations VALUES (1, 1)")
        connection.execute("INSERT INTO conversations VALUES ('legacy', 'Existing chat', 1, 1, NULL)")
        connection.execute("INSERT INTO branches VALUES ('legacy-main', 'legacy', 'main', NULL, 1, 1)")
        payload = {"type": "message", "role": "user", "content": [{"type": "text", "text": "Existing message"}]}
        connection.execute(
            "INSERT INTO items VALUES ('legacy-item', 'legacy', NULL, NULL, 'message', 1, ?, 1)",
            (json.dumps(payload),),
        )
        connection.execute("UPDATE branches SET head_item_id = 'legacy-item' WHERE id = 'legacy-main'")
        connection.commit()
        connection.close()
        with TestClient(build_app(legacy_dir, TOKEN)) as client:
            response = client.get("/v1/conversations/legacy", headers={"Authorization": f"Bearer {TOKEN}"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["title"], "Existing chat")
            self.assertIsNone(response.json()["archived_at"])
            history = client.get("/v1/conversations/legacy/branches/legacy-main/history", headers={"Authorization": f"Bearer {TOKEN}"})
            self.assertEqual(history.json()["items"][0]["payload"], payload)

    def test_metadata_version_advances_even_when_clock_moves_backwards(self) -> None:
        conversation_id, branch_id = self.make_conversation()
        previous = self.request("GET", f"/v1/conversations/{conversation_id}")[1]["updated_at"]
        with patch("zellige.service.now_us", return_value=1):
            self.assertEqual(self.append_message(conversation_id, branch_id, None, "Saved")[0], 201)
            current = self.request("GET", f"/v1/conversations/{conversation_id}")[1]["updated_at"]
            self.assertGreater(current, previous)
            self.assertEqual(self.request("PATCH", f"/v1/conversations/{conversation_id}", {
                "title": "Stale", "expected_updated_at": previous,
            })[0], 409)

    def test_built_web_is_served_without_exposing_api_or_files(self) -> None:
        assets = self.data_dir / "web"
        assets.mkdir()
        (assets / "index.html").write_text("<!doctype html><title>Zellige test</title>")
        with TestClient(build_app(self.data_dir, TOKEN, assets)) as client:
            self.assertIn("Zellige test", client.get("/").text)
            self.assertEqual(client.get("/v1/conversations").status_code, 401)
            self.assertEqual(client.get("/v1/not-a-route").status_code, 404)
            self.assertEqual(client.get("/zellige.sqlite3").status_code, 404)
            self.assertEqual(client.get("/health").status_code, 200)

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
        self.assertEqual(len(self.request("GET", "/v1/runtime-profiles")[1]["profiles"]), 2)
        stored_runs = self.request("GET", f"/v1/conversations/{conversation_id}/runs")[1]["runs"]
        self.assertEqual(len(stored_runs), 2)
        self.assertEqual(stored_runs[0]["context_pack_version_ids"], [context_v2["id"]])

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
                "listConversations",
                "getConversation",
                "updateConversation",
                "listBranches",
                "listRuntimeProfiles",
                "listConversationRuns",
                "createConversation",
                "createBranch",
                "appendItem",
                "getBranchHistory",
                "createRuntimeProfile",
                "createContextPack",
                "createContextPackVersion",
                "createRun",
                "claimRun",
                "finishRun",
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
