from __future__ import annotations

import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from zellige.worker import codex_evidence, execute_work, git_evidence, git_snapshot


def work():
    return {
        "run": {
            "id": "run-1",
            "input_head_item_id": "item-1",
            "request": {},
        },
        "runtime_profile_version": {
            "definition": {
                "harness": "codex",
                "workspace": ".",
                "sandbox": "workspace-write",
            },
        },
        "items": [{
            "id": "item-1",
            "kind": "message",
            "payload": {
                "type": "message",
                "role": "user",
                "content": [{"type": "text", "text": "Fix it and run tests"}],
            },
        }],
        "context_pack_versions": [],
    }


class WorkerEvidenceTest(unittest.TestCase):
    def test_codex_jsonl_captures_commands_tests_and_safe_file_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            stdout = "\n".join([
                json.dumps({
                    "type": "item.completed",
                    "item": {
                        "id": "cmd-1",
                        "type": "command_execution",
                        "command": "npm test",
                        "aggregated_output": "secret test output that must not be persisted",
                        "exit_code": 0,
                        "status": "completed",
                        "duration_ms": 123,
                    },
                }),
                json.dumps({
                    "type": "item.completed",
                    "item": {
                        "id": "cmd-2",
                        "type": "command_execution",
                        "command": "git status --short",
                        "exit_code": 0,
                        "status": "completed",
                    },
                }),
                json.dumps({
                    "type": "item.completed",
                    "item": {
                        "id": "cmd-3",
                        "type": "command_execution",
                        "command": "echo npm test",
                        "exit_code": 0,
                        "status": "completed",
                    },
                }),
                json.dumps({
                    "type": "item.completed",
                    "item": {
                        "id": "file-1",
                        "type": "file_change",
                        "changes": [
                            {"path": str(workspace / "src" / "app.ts"), "kind": "update"},
                            {"path": str(workspace.parent / "outside.txt"), "kind": "add"},
                        ],
                    },
                }),
            ])
            evidence = codex_evidence(stdout, workspace)

        self.assertEqual(evidence["commands"][0]["kind"], "test")
        self.assertEqual(evidence["commands"][0]["exit_code"], 0)
        self.assertEqual(evidence["commands"][1]["kind"], "command")
        self.assertEqual(evidence["commands"][2]["kind"], "command")
        self.assertNotIn("aggregated_output", evidence["commands"][0])
        self.assertNotIn("secret test output", json.dumps(evidence))
        self.assertEqual(
            evidence["file_changes"],
            [{"path": "src/app.ts", "kind": "update"}],
        )

    def test_git_evidence_records_before_after_without_patch_content(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            subprocess.check_call(["git", "init", "-q"], cwd=workspace)
            subprocess.check_call(
                ["git", "config", "user.email", "test@example.com"], cwd=workspace
            )
            subprocess.check_call(["git", "config", "user.name", "Test"], cwd=workspace)
            target = workspace / "app.txt"
            target.write_text("before\n", encoding="utf-8")
            subprocess.check_call(["git", "add", "app.txt"], cwd=workspace)
            subprocess.check_call(["git", "commit", "-qm", "initial"], cwd=workspace)

            before = git_snapshot(workspace)
            target.write_text("after\n", encoding="utf-8")
            after = git_snapshot(workspace)
            evidence = git_evidence(workspace, before, after)

        self.assertTrue(evidence["available"])
        self.assertFalse(evidence["dirty_before"])
        self.assertTrue(evidence["dirty_after"])
        self.assertEqual(evidence["working_diff"][0]["path"], "app.txt")
        self.assertEqual(evidence["working_diff"][0]["added"], 1)
        self.assertEqual(evidence["working_diff"][0]["deleted"], 1)
        serialized = json.dumps(evidence)
        self.assertNotIn("before\n", serialized)
        self.assertNotIn("after\n", serialized)

    def test_execute_work_persists_review_evidence_on_success_and_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            stream = "\n".join([
                json.dumps({"type": "thread.started", "thread_id": "native-thread"}),
                json.dumps({
                    "type": "item.completed",
                    "item": {
                        "type": "command_execution",
                        "command": "python -m unittest",
                        "exit_code": 0,
                        "status": "completed",
                    },
                }),
            ])

            def success(argv, **kwargs):
                Path(argv[argv.index("--output-last-message") + 1]).write_text(
                    "Done", encoding="utf-8"
                )
                return subprocess.CompletedProcess(
                    argv, 0, stdout=stream, stderr=""
                )

            git_states = [
                {
                    "available": True,
                    "head": "a",
                    "dirty": False,
                    "status": [],
                    "working_diff": [],
                },
                {
                    "available": True,
                    "head": "a",
                    "dirty": True,
                    "status": [{"code": " M", "path": "x.py"}],
                    "working_diff": [{"path": "x.py", "added": 1, "deleted": 0}],
                },
            ]
            with patch("zellige.worker.subprocess.run", side_effect=success), patch(
                "zellige.worker.git_snapshot", side_effect=git_states
            ):
                status, result = execute_work(work(), root)

            self.assertEqual(status, "completed")
            self.assertEqual(result["evidence"]["schema_version"], 1)
            self.assertEqual(result["evidence"]["commands"][0]["kind"], "test")
            self.assertTrue(result["evidence"]["git"]["dirty_after"])

            with patch(
                "zellige.worker.subprocess.run",
                return_value=subprocess.CompletedProcess(
                    [], 2, stdout=stream, stderr="failed"
                ),
            ), patch("zellige.worker.git_snapshot", side_effect=git_states):
                status, result = execute_work(work(), root)

            self.assertEqual(status, "failed")
            self.assertEqual(result["evidence"]["commands"][0]["exit_code"], 0)
            self.assertIn("evidence", result)


if __name__ == "__main__":
    unittest.main()
