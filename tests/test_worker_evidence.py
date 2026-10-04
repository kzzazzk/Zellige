from __future__ import annotations

import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from zellige.worker import (
    COMMAND_LIMIT, EVIDENCE_ITEM_LIMIT, codex_evidence, execute_work,
    git_evidence, git_snapshot,
)


def command_stream(commands):
    return "\n".join(json.dumps({
        "type": "item.completed",
        "item": {"type": "command_execution", "command": command,
                 "status": "completed", "exit_code": 0},
    }) for command in commands)


def git_read(*, head="a", status="", diff="", fail=None):
    def read(workspace, *args):
        if args == fail:
            raise subprocess.CalledProcessError(1, ["git", *args])
        if args == ("rev-parse", "--is-inside-work-tree"):
            return "true\n"
        if args == ("rev-parse", "HEAD"):
            return head + "\n"
        if args[0] == "status":
            return status
        if args[:2] == ("diff", "--numstat"):
            return diff
        raise AssertionError(args)
    return read


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
    def test_only_simple_known_test_argv_are_classified_as_tests(self):
        commands = [
            "pytest -q", "/usr/bin/pytest tests", "python -m pytest",
            "python3 -m unittest discover -s tests -v", "vitest run", "jest",
            "npm test", "npm run test", "npm run test:unit",
            "pnpm test", "yarn test", "bun test", "cargo test", "go test ./...",
            "dotnet test", "mvn test", "mvn -q -DskipITs=true clean test",
            "./mvnw -B test", "gradle test", "./gradlew test",
            "bash -lc 'npm test'", '/bin/sh -lc "pytest -q"',
            "zsh -lc 'python3 -m unittest'", "fish -lc 'npm run test:unit'",
        ]
        for command in commands:
            with self.subTest(command=command):
                evidence = codex_evidence(command_stream([command]), Path.cwd())
                self.assertEqual(evidence["commands"][0]["kind"], "test")

    def test_false_positives_are_ordinary_command_evidence_even_with_exit_zero(self):
        commands = [
            'echo "example; pytest"', "false && npm test", "npm test || true",
            "pytest-fake", "npm test:unit", "echo pytest", "echo npm test",
            "cd web && npm test", "npm test; true", "npm test | cat",
            "npm test\ntrue", "npm test > result.txt", "pytest 2>&1",
            "npm test &", "if true; then pytest; fi", "(pytest)", "{ pytest; }",
            "pytest $(echo tests)", "pytest `echo tests`", "pytest # comment",
            "bash -lc 'npm test || true'", "sh -lc 'false && pytest'",
            'zsh -lc "echo example; pytest"', "fish -lc 'npm test; true'",
            "bash -lc 'npm test' ignored", "bash -c 'npm test'",
            "bash -lc 'sh -lc pytest'", "python -m pytest-fake", "python fake.py pytest",
            "mvn -f test", "mvn --file test", "npm run test:", "NPM test",
            "pytest 'unterminated",
        ]
        for command in commands:
            with self.subTest(command=command):
                evidence = codex_evidence(command_stream([command]), Path.cwd())
                self.assertEqual(evidence["commands"][0]["kind"], "command")
                self.assertEqual(evidence["commands"][0]["exit_code"], 0)

    def test_command_text_truncation_boundary_is_separate_from_list_truncation(self):
        for length in (COMMAND_LIMIT - 1, COMMAND_LIMIT, COMMAND_LIMIT + 1):
            with self.subTest(length=length):
                command = "pytest " + "x" * (length - 7)
                evidence = codex_evidence(command_stream([command]), Path.cwd())
                entry = evidence["commands"][0]
                self.assertEqual(entry["command"], command[:COMMAND_LIMIT])
                self.assertEqual(entry["command_truncated"], length > COMMAND_LIMIT)
                self.assertFalse(evidence["commands_truncated"])
        # Classification uses the full invocation, including control syntax beyond the cap.
        command = "pytest " + "x" * COMMAND_LIMIT + " || true"
        entry = codex_evidence(command_stream([command]), Path.cwd())["commands"][0]
        self.assertEqual(entry["kind"], "command")
        self.assertTrue(entry["command_truncated"])
        for count in (EVIDENCE_ITEM_LIMIT, EVIDENCE_ITEM_LIMIT + 1):
            with self.subTest(count=count):
                evidence = codex_evidence(command_stream(["npm test"] * count), Path.cwd())
                self.assertEqual(len(evidence["commands"]), EVIDENCE_ITEM_LIMIT)
                self.assertEqual(evidence["commands_truncated"], count > EVIDENCE_ITEM_LIMIT)
                self.assertTrue(all(not entry["command_truncated"] for entry in evidence["commands"]))

    def test_git_subread_failures_do_not_look_like_empty_successful_reads(self):
        failures = [
            (("rev-parse", "HEAD"), "head"),
            (("status", "--porcelain=v1", "--untracked-files=all", "--", "."), "status"),
            (("diff", "--numstat", "HEAD", "--", "."), "working_diff"),
        ]
        for argv, field in failures:
            with self.subTest(field=field), patch("zellige.worker._git_output", side_effect=git_read(fail=argv)):
                snapshot = git_snapshot(Path.cwd())
                evidence = git_evidence(Path.cwd(), snapshot, snapshot)
            self.assertTrue(snapshot["available"])
            self.assertFalse(snapshot[field + "_available"])
            self.assertIsNone(snapshot[field])
            self.assertTrue(evidence["available"])
            self.assertFalse(evidence["complete"])
            if field == "status":
                self.assertIsNone(evidence["dirty_after"])
                self.assertIsNone(evidence["status_after"])
            if field == "working_diff":
                self.assertIsNone(evidence["working_diff"])
                self.assertFalse(evidence["working_diff_available"])
            # A failed before-read also makes the combined evidence incomplete.
            with patch("zellige.worker._git_output", side_effect=git_read()):
                successful = git_snapshot(Path.cwd())
                self.assertFalse(git_evidence(Path.cwd(), snapshot, successful)["complete"])

    def test_committed_diff_failure_is_unavailable_not_empty(self):
        with patch("zellige.worker._git_output", side_effect=git_read()):
            before = git_snapshot(Path.cwd())
        with patch("zellige.worker._git_output", side_effect=git_read(head="b")):
            after = git_snapshot(Path.cwd())
        with patch("zellige.worker._git_output", side_effect=git_read(
            fail=("diff", "--numstat", "a..b", "--", ".")
        )):
            evidence = git_evidence(Path.cwd(), before, after)
        self.assertTrue(evidence["available"])
        self.assertIsNone(evidence["committed_diff"])
        self.assertFalse(evidence["committed_diff_available"])
        self.assertFalse(evidence["complete"])

    def test_git_list_truncation_exact_boundary_and_over_limit(self):
        for count in (0, EVIDENCE_ITEM_LIMIT, EVIDENCE_ITEM_LIMIT + 1):
            with self.subTest(count=count):
                status = "".join(f" M file-{index}\n" for index in range(count))
                diff = "".join(f"1\t2\tfile-{index}\n" for index in range(count))
                with patch("zellige.worker._git_output", side_effect=git_read(status=status, diff=diff)):
                    before = git_snapshot(Path.cwd())
                with patch("zellige.worker._git_output", side_effect=git_read(head="b", status=status, diff=diff)):
                    after = git_snapshot(Path.cwd())
                    evidence = git_evidence(Path.cwd(), before, after)
                truncated = count > EVIDENCE_ITEM_LIMIT
                self.assertEqual(len(after["status"]), min(count, EVIDENCE_ITEM_LIMIT))
                self.assertEqual(len(after["working_diff"]), min(count, EVIDENCE_ITEM_LIMIT))
                self.assertEqual(len(evidence["committed_diff"]), min(count, EVIDENCE_ITEM_LIMIT))
                for field in ("status_before", "status_after", "working_diff_before", "working_diff", "committed_diff"):
                    self.assertTrue(evidence[field + "_available"])
                    self.assertEqual(evidence[field + "_truncated"], truncated)
                self.assertEqual(evidence["complete"], not truncated)

    def test_non_git_workspace_remains_unavailable(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            snapshot = git_snapshot(workspace)
            self.assertEqual(snapshot, {"available": False})
            self.assertEqual(git_evidence(workspace, snapshot, snapshot), {"available": False})

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
        self.assertTrue(evidence["complete"])
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
                    "head_available": True,
                    "status_available": True,
                    "status_truncated": False,
                    "working_diff_available": True,
                    "working_diff_truncated": False,
                },
                {
                    "available": True,
                    "head": "a",
                    "dirty": True,
                    "status": [{"code": " M", "path": "x.py"}],
                    "working_diff": [{"path": "x.py", "added": 1, "deleted": 0}],
                    "head_available": True,
                    "status_available": True,
                    "status_truncated": False,
                    "working_diff_available": True,
                    "working_diff_truncated": False,
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
