from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from zellige.worker import (
    build_prompt,
    execute_work,
    run_once,
    thread_id_from_jsonl,
    validate_profile,
)


def work(definition=None, *, items=None, instructions=None):
    request = {}
    if instructions is not None:
        request["instructions"] = instructions
    return {
        "run": {
            "id": "run-1",
            "input_head_item_id": "item-1" if items is not None else None,
            "request": request,
        },
        "runtime_profile_version": {
            "definition": definition or {"harness": "codex", "workspace": "."},
        },
        "items": items if items is not None else [{
            "id": "item-1",
            "kind": "message",
            "payload": {
                "type": "message",
                "role": "user",
                "content": [{"type": "text", "text": "Fix the failing test"}],
            },
        }],
        "context_pack_versions": [
            {"id": "ctx-1", "manifest": {"repository": "demo"}},
        ],
    }


class WorkerTest(unittest.TestCase):
    def test_workspace_is_confined_including_symlinks(self):
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as outside:
            root = Path(directory)
            child = root / "repo"
            child.mkdir()
            target, config = validate_profile(
                {"harness": "codex", "workspace": "repo"}, root
            )
            self.assertEqual(target, child.resolve())
            self.assertEqual(config["workspace"], "repo")
            for candidate in ("/tmp", "../escape"):
                with self.subTest(candidate=candidate):
                    with self.assertRaises(ValueError):
                        validate_profile({"harness": "codex", "workspace": candidate}, root)
            link = root / "escape-link"
            link.symlink_to(Path(outside), target_is_directory=True)
            with self.assertRaises(ValueError):
                validate_profile({"harness": "codex", "workspace": "escape-link"}, root)

    def test_profile_rejects_unsupported_or_dangerous_configuration(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            invalid = [
                {"harness": "other"},
                {"harness": "codex", "sandbox": "danger-full-access"},
                {"harness": "codex", "command": "rm -rf /"},
                {"harness": "codex", "reasoning_effort": "maximum"},
                {"harness": "codex", "model": ""},
            ]
            for definition in invalid:
                with self.subTest(definition=definition):
                    with self.assertRaises(ValueError):
                        validate_profile(definition, root)

    def test_prompt_uses_pinned_snapshot_context_and_instructions(self):
        prompt = build_prompt(work(instructions="Run the tests"))
        self.assertIn("item-1", prompt)
        self.assertIn("Fix the failing test", prompt)
        self.assertIn("ctx-1", prompt)
        self.assertIn("Run the tests", prompt)
        self.assertIn("later branch changes are excluded", prompt)

    def test_prompt_rejects_empty_work(self):
        with self.assertRaises(ValueError):
            build_prompt(work(items=[], instructions="   "))

    def test_thread_id_parser_is_best_effort(self):
        stdout = "\n".join([
            "not json",
            json.dumps({"type": "noise"}),
            json.dumps({"type": "thread.started", "thread": {"id": "thread-native"}}),
        ])
        self.assertEqual(thread_id_from_jsonl(stdout), "thread-native")
        self.assertIsNone(thread_id_from_jsonl("{}"))

    def test_success_executes_fixed_codex_argv_without_shell(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            seen = {}

            def fake_run(argv, **kwargs):
                seen["argv"] = argv
                seen["kwargs"] = kwargs
                output = Path(argv[argv.index("--output-last-message") + 1])
                output.write_text("Implemented and tested", encoding="utf-8")
                return subprocess.CompletedProcess(
                    argv, 0,
                    stdout=json.dumps({"type": "thread.started", "thread_id": "native-1"}) + "\n",
                    stderr="",
                )

            definition = {
                "harness": "codex",
                "workspace": ".",
                "model": "gpt-test",
                "reasoning_effort": "high",
                "sandbox": "workspace-write",
            }
            with patch("zellige.worker.subprocess.run", side_effect=fake_run):
                status, result = execute_work(work(definition), root)

            self.assertEqual(status, "completed")
            self.assertEqual(result["summary"], "Implemented and tested")
            self.assertEqual(result["execution"]["thread_id"], "native-1")
            self.assertEqual(result["execution"]["exit_code"], 0)
            argv = seen["argv"]
            self.assertEqual(argv[:3], ["codex", "exec", "--json"])
            self.assertIn("--approve-for-me", argv)
            self.assertIn("--model=gpt-test", argv)
            self.assertEqual(argv[-1], "-")
            self.assertFalse(seen["kwargs"]["shell"])
            self.assertEqual(Path(seen["kwargs"]["cwd"]), root.resolve())
            self.assertNotIn("ZELLIGE_API_TOKEN", seen["kwargs"]["env"])
            self.assertIn("Fix the failing test", seen["kwargs"]["input"])

    def test_read_only_argv_and_nonzero_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            seen = {}
            def fake_run(argv, **kwargs):
                seen["argv"] = argv
                return subprocess.CompletedProcess(argv, 7, stdout="{}", stderr="boom")

            definition = {"harness": "codex", "sandbox": "read-only"}
            with patch("zellige.worker.subprocess.run", side_effect=fake_run):
                status, result = execute_work(work(definition), root)
            self.assertEqual(status, "failed")
            self.assertIn("boom", result["error"])
            self.assertEqual(result["execution"]["exit_code"], 7)
            self.assertIn("--sandbox", seen["argv"])
            self.assertNotIn("--approve-for-me", seen["argv"])

    def test_exception_becomes_failed_result_without_retry(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch("zellige.worker.subprocess.run", side_effect=OSError("missing codex")) as process:
                status, result = execute_work(work(), Path(directory))
            self.assertEqual(status, "failed")
            self.assertIn("missing codex", result["error"])
            process.assert_called_once()

    def test_run_once_finishes_exactly_once_and_redacts_token(self):
        class Client:
            token = "super-secret"
            def __init__(self):
                self.claims = 0
                self.finished = []
            def claim(self):
                self.claims += 1
                return work()
            def finish(self, run_id, status, result):
                self.finished.append((run_id, status, result))

        client = Client()
        with tempfile.TemporaryDirectory() as directory, patch(
            "zellige.worker.execute_work",
            return_value=("failed", {"error": "contains super-secret", "execution": {}}),
        ):
            self.assertTrue(run_once(client, Path(directory)))
        self.assertEqual(client.claims, 1)
        self.assertEqual(len(client.finished), 1)
        self.assertEqual(client.finished[0][0], "run-1")
        self.assertEqual(client.finished[0][1], "failed")
        self.assertEqual(client.finished[0][2]["error"], "contains [redacted]")


if __name__ == "__main__":
    unittest.main()

