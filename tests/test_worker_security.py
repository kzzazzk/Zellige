from __future__ import annotations

import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError, URLError

from zellige.worker import (
    APIClient, ERROR_LIMIT, SUMMARY_LIMIT, NoRedirect,
    execute_work, main, run_once, thread_id_from_jsonl, validate_profile,
)


def work_package():
    return {
        "run": {"id": "run-1", "input_head_item_id": None,
                "request": {"instructions": "Review the workspace"}},
        "runtime_profile_version": {"definition": {"harness": "codex"}},
        "items": [], "context_pack_versions": [],
    }


class WorkerSecurityTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)

    def tearDown(self):
        self.temporary.cleanup()

    def test_url_credentials_and_invalid_tokens_are_rejected(self):
        for url in ("file:///tmp/api", "http://user:secret@localhost", "http://localhost?secret",
                    "https://localhost#secret", "http:///missing"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                APIClient(url, "token")
        for token in ("", " ", "secret\nheader", "secret\rheader", None):
            with self.subTest(token=token), self.assertRaises(ValueError):
                APIClient("http://localhost", token)

    def test_redirects_are_not_followed_with_credentials(self):
        handler = NoRedirect()
        self.assertIsNone(handler.redirect_request(None, None, 302, "redirect", {}, "https://other"))
        client = APIClient("http://localhost", "token")
        self.assertTrue(any(isinstance(handler, NoRedirect) for handler in client.opener.handlers))

    def test_nested_symlink_prefix_and_invalid_paths_fail_before_process(self):
        child = self.root / "child"
        child.mkdir()
        with tempfile.TemporaryDirectory(prefix=self.root.name + "-outside-") as outside:
            (child / "link").symlink_to(outside, target_is_directory=True)
            (self.root / "alias").symlink_to(child, target_is_directory=True)
            for workspace in ("child/link", "alias/link", "\x00", "child/../../escape"):
                work = work_package()
                work["runtime_profile_version"]["definition"]["workspace"] = workspace
                with self.subTest(workspace=workspace), patch("zellige.worker.subprocess.run") as process:
                    status, _ = execute_work(work, self.root)
                self.assertEqual(status, "failed")
                process.assert_not_called()
        for definition in ([], None, {"harness": "codex", "command": "touch anything"}):
            with self.subTest(definition=definition), self.assertRaises(ValueError):
                validate_profile(definition, self.root)

    def test_redaction_preserves_result_keys_and_final_bounds(self):
        client = Mock(token="error")
        client.claim.return_value = work_package()
        with patch("zellige.worker.subprocess.run", side_effect=OSError("error in launch")):
            run_once(client, self.root)
        result = client.finish.call_args.args[2]
        self.assertIn("error", result)
        self.assertNotIn("error", result["error"])
        client.token = "x"
        with patch("zellige.worker.subprocess.run", return_value=subprocess.CompletedProcess([], 1, "", "x" * ERROR_LIMIT)):
            run_once(client, self.root)
        self.assertLessEqual(len(client.finish.call_args.args[2]["error"]), ERROR_LIMIT)
        def final_message(argv, **kwargs):
            Path(argv[argv.index("--output-last-message") + 1]).write_text("x" * (SUMMARY_LIMIT + 1))
            return subprocess.CompletedProcess(argv, 0, "", "")
        with patch("zellige.worker.subprocess.run", side_effect=final_message):
            run_once(client, self.root)
        result = client.finish.call_args.args[2]
        self.assertEqual(client.finish.call_args.args[1], "completed")
        self.assertLessEqual(len(result["summary"]), SUMMARY_LIMIT)
        self.assertNotIn("x", result["summary"])

    def test_jsonl_thread_id_is_bounded(self):
        self.assertEqual(len(thread_id_from_jsonl(json.dumps({"thread_id": "a" * 1000}))), 256)

    def test_invalid_poll_settings_do_not_claim(self):
        for value in ("0", "-1", "nan", "inf"):
            with self.subTest(value=value), patch("zellige.worker.APIClient") as client, patch("sys.stderr", new_callable=io.StringIO):
                with self.assertRaises(SystemExit) as raised:
                    main(["--token", "token", "--workspace-root", str(self.root), "--poll-interval", value])
                self.assertEqual(raised.exception.code, 2)
                client.assert_not_called()

    def test_claim_failure_exits_once_without_exposing_token(self):
        with patch("zellige.worker.APIClient") as client, patch("sys.stderr", new_callable=io.StringIO) as stderr:
            client.return_value.claim.side_effect = RuntimeError("private-token")
            self.assertEqual(main(["--token", "private-token", "--workspace-root", str(self.root)]), 1)
            client.return_value.claim.assert_called_once()
            client.return_value.finish.assert_not_called()
            self.assertNotIn("private-token", stderr.getvalue())

    def test_poll_only_waits_when_queue_is_empty(self):
        with patch("zellige.worker.APIClient"), patch("zellige.worker.run_once", side_effect=[True, False, KeyboardInterrupt]), patch("zellige.worker.time.sleep") as sleep:
            self.assertEqual(main(["--token", "token", "--workspace-root", str(self.root), "--poll-interval", "0.5"]), 130)
            sleep.assert_called_once_with(0.5)

    def test_once_claims_at_most_one_and_finishes_success_or_failure(self):
        args = ["--token", "token", "--workspace-root", str(self.root), "--once"]
        for status in ("completed", "failed"):
            with self.subTest(status=status), patch("zellige.worker.APIClient") as client, patch("zellige.worker.execute_work", return_value=(status, {"summary": "handled"})), patch("zellige.worker.time.sleep") as sleep:
                client.return_value.token = "token"
                client.return_value.claim.return_value = work_package()
                self.assertEqual(main(args), 0)
                client.return_value.claim.assert_called_once()
                client.return_value.finish.assert_called_once_with("run-1", status, {"summary": "handled"})
                sleep.assert_not_called()
        with patch("zellige.worker.APIClient") as client, patch("zellige.worker.execute_work") as execute:
            client.return_value.claim.return_value = None
            self.assertEqual(main(args), 0)
            client.return_value.claim.assert_called_once()
            client.return_value.finish.assert_not_called()
            execute.assert_not_called()

    def test_http_contract_and_sanitized_failure_without_retry(self):
        client = APIClient("http://localhost:8787/", "private-token")
        with patch.object(client.opener, "open") as post:
            post.return_value.__enter__.return_value = io.StringIO('{"work":null}')
            self.assertIsNone(client.claim())
            request = post.call_args.args[0]
            self.assertEqual(request.full_url, "http://localhost:8787/v1/runner/runs/claim")
            self.assertEqual(request.get_method(), "POST")
            self.assertEqual(request.get_header("Authorization"), "Bearer private-token")
            self.assertEqual(json.loads(request.data), {"harness": "codex"})
            self.assertEqual(post.call_args.kwargs["timeout"], 30)
        with patch.object(client, "post") as post:
            client.finish("a/b", "failed", {"error": "failure"})
            post.assert_called_once_with("/v1/runner/runs/a%2Fb/finish", {"status": "failed", "result": {"error": "failure"}})
        for error in (HTTPError("private-token", 409, "private-token", {}, None), URLError("private-token")):
            with self.subTest(error=type(error)), patch.object(client.opener, "open", side_effect=error) as post:
                with self.assertRaises(RuntimeError) as raised:
                    client.claim()
                self.assertNotIn("private-token", str(raised.exception))
                post.assert_called_once()
                if isinstance(error, HTTPError):
                    self.assertTrue(error.closed)

    def test_empty_prompt_invalid_instructions_or_config_never_launch_codex(self):
        for update in ({"instructions": " "}, {"instructions": []}, {"instructions": None}):
            work = work_package()
            work["run"]["request"] = update
            with self.subTest(update=update), patch("zellige.worker.subprocess.run") as process:
                status, result = execute_work(work, self.root)
                self.assertEqual(status, "failed")
                self.assertIsNone(result["execution"]["exit_code"])
                process.assert_not_called()
        for key, value in (("reasoning_effort", []), ("sandbox", {}), ("model", None), ("workspace", None), ("mode", [])):
            with self.subTest(key=key), self.assertRaises(ValueError):
                validate_profile({"harness": "codex", key: value}, self.root)

    def test_success_without_final_message_is_failed(self):
        def empty_message(argv, **kwargs):
            Path(argv[argv.index("--output-last-message") + 1]).write_text(" \n")
            return subprocess.CompletedProcess(argv, 0, "", "")
        for fake in (empty_message, lambda *args, **kwargs: subprocess.CompletedProcess([], 0, "", "")):
            with self.subTest(fake=fake), patch("zellige.worker.subprocess.run", side_effect=fake) as process:
                status, result = execute_work(work_package(), self.root)
                self.assertEqual(status, "failed")
                self.assertEqual(result["execution"]["exit_code"], 0)
                process.assert_called_once()
