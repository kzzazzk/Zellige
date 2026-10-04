"""Local Codex runner. Canonical state is accessed exclusively through HTTP."""
from __future__ import annotations

import argparse
import json
import math
import os
import shlex
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler

ERROR_LIMIT = 8_000
SUMMARY_LIMIT = 64_000
EVIDENCE_ITEM_LIMIT = 100
COMMAND_LIMIT = 2_048
PATH_LIMIT = 1_024


class NoRedirect(HTTPRedirectHandler):
    """Do not forward bearer credentials to a redirect target."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class APIClient:
    def __init__(self, url: str, token: str):
        parsed = urlsplit(url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("API URL must be an HTTP(S) base URL without credentials, query or fragment")
        if not isinstance(token, str) or not token.strip() or "\r" in token or "\n" in token:
            raise ValueError("API token must be non-empty and contain no line breaks")
        self.url = url.rstrip("/")
        self.token = token
        self.opener = build_opener(NoRedirect())

    def post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        request = Request(
            self.url + path, data=json.dumps(body).encode("utf-8"), method="POST",
            headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"},
        )
        try:
            with self.opener.open(request, timeout=30) as response:
                return json.load(response)
        except HTTPError as error:
            error.close()
            raise RuntimeError(f"Worker API returned HTTP {error.code}") from None
        except URLError:
            raise RuntimeError("Worker API connection failed") from None

    def claim(self) -> dict[str, Any] | None:
        return self.post("/v1/runner/runs/claim", {"harness": "codex"})["work"]

    def finish(self, run_id: str, status: str, result: dict[str, Any]) -> None:
        self.post(f"/v1/runner/runs/{quote(run_id, safe='')}/finish", {"status": status, "result": result})


def validate_profile(definition: dict[str, Any], workspace_root: Path) -> tuple[Path, dict[str, Any]]:
    if not isinstance(definition, dict) or definition.get("harness") != "codex":
        raise ValueError("Runtime profile harness must be codex")
    if set(definition) - {"mode", "harness", "workspace", "model", "reasoning_effort", "sandbox"}:
        raise ValueError("Unsupported runtime profile configuration")
    if "mode" in definition and (not isinstance(definition["mode"], str) or not definition["mode"].strip()):
        raise ValueError("mode must be a non-empty string")
    workspace = definition.get("workspace", ".")
    if not isinstance(workspace, str) or not workspace.strip():
        raise ValueError("workspace must be a non-empty relative path")
    if "\x00" in workspace:
        raise ValueError("workspace contains an invalid character")
    relative = Path(workspace)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("workspace must stay under the workspace root")
    root = workspace_root.resolve(strict=True)
    target = (root / relative).resolve(strict=True)
    if not root.is_dir() or not target.is_dir() or not target.is_relative_to(root):
        raise ValueError("workspace must resolve to a directory under the workspace root")
    model = definition.get("model")
    if "model" in definition and (not isinstance(model, str) or not model.strip()):
        raise ValueError("model must be a non-empty string")
    effort = definition.get("reasoning_effort")
    if "reasoning_effort" in definition and (not isinstance(effort, str) or effort not in {"low", "medium", "high", "ultra"}):
        raise ValueError("Unsupported reasoning_effort")
    sandbox = definition.get("sandbox", "read-only")
    if not isinstance(sandbox, str) or sandbox not in {"read-only", "workspace-write"}:
        raise ValueError("sandbox must be read-only or workspace-write")
    return target, {"harness": "codex", "workspace": target.relative_to(root).as_posix(),
                    "model": model, "reasoning_effort": effort, "sandbox": sandbox}


def build_prompt(work: dict[str, Any]) -> str:
    request = work["run"]["request"]
    instructions = request.get("instructions")
    if instructions is not None and not isinstance(instructions, str):
        raise ValueError("run.request.instructions must be a string")
    meaningful = any(
        item["kind"] == "message" and item["payload"].get("role") == "user"
        and any(block.get("type") == "text" and isinstance(block.get("text"), str)
                and block["text"].strip() for block in item["payload"].get("content", []))
        for item in work["items"]
    )
    if not meaningful and not (instructions and instructions.strip()):
        raise ValueError("No meaningful user message or instructions in the pinned snapshot")
    context = {
        "input_head_item_id": work["run"]["input_head_item_id"],
        "items": work["items"],
        "context_pack_versions": work["context_pack_versions"],
        "instructions": instructions,
    }
    return (
        "Execute the latest user request represented by the pinned conversation snapshot below.\n"
        "Items are ordered from root to the pinned input head; later branch changes are excluded.\n"
        "Use the ordered context pack manifests and optional additional instructions as context.\n"
        "Return a useful final summary of the result or explain the failure.\n"
        + json.dumps(context, ensure_ascii=False, sort_keys=True, indent=2)
    )


def _jsonl_events(stdout: str):
    for line in stdout.splitlines():
        try:
            event = json.loads(line)
        except (ValueError, TypeError):
            continue
        if isinstance(event, dict):
            yield event


def thread_id_from_jsonl(stdout: str) -> str | None:
    for event in _jsonl_events(stdout):
        for key in ("thread_id", "session_id"):
            if isinstance(event.get(key), str) and event[key]:
                return event[key][:256]
        if event.get("type") in {"thread.started", "session.started"}:
            for key in ("thread", "session"):
                native = event.get(key)
                if isinstance(native, dict) and isinstance(native.get("id"), str) and native["id"]:
                    return native["id"][:256]
    return None


def _test_command(command: str) -> bool:
    # Reject even quoted shell syntax: false negatives are safer than masked exits.
    if any(character in command for character in ";&|<>\n\r`$(){}\\#"):
        return False
    try:
        argv = shlex.split(command)
    except ValueError:
        return False
    if not argv:
        return False
    executable = Path(argv[0]).name
    if executable in {"bash", "sh", "zsh", "fish"}:
        if len(argv) != 3 or argv[1] != "-lc":
            return False
        # Only one wrapper is supported, with a simple runner as its body.
        try:
            argv = shlex.split(argv[2])
        except ValueError:
            return False
        if not argv:
            return False
        executable = Path(argv[0]).name
    args = argv[1:]
    if executable in {"pytest", "vitest", "jest"}:
        return True
    if executable in {"python", "python3"}:
        return len(args) >= 2 and args[0] == "-m" and args[1] in {"pytest", "unittest"}
    if executable == "npm":
        return bool(args) and (args[0] == "test" or (
            len(args) >= 2 and args[0] == "run" and (
                args[1] == "test" or (args[1].startswith("test:") and len(args[1]) > 5)
            )
        ))
    if executable in {"pnpm", "yarn", "bun", "cargo", "go", "dotnet", "gradle", "gradlew"}:
        return bool(args) and args[0] == "test"
    if executable in {"mvn", "mvnw"}:
        # Allow common attached options/switches, never mistake an option value for a goal.
        switches = {"-q", "--quiet", "-B", "--batch-mode", "-e", "--errors", "-X", "--debug", "-o", "--offline"}
        for arg in args:
            if arg == "test":
                return True
            if arg in switches or (arg.startswith(("-D", "-P")) and len(arg) > 2):
                continue
            if arg not in {"clean", "validate", "compile", "test-compile"}:
                return False
    return False


def _safe_evidence_path(value: Any, workspace: Path) -> str | None:
    if not isinstance(value, str) or not value or "\x00" in value:
        return None
    try:
        path = Path(value)
        resolved = path.resolve(strict=False) if path.is_absolute() else (workspace / path).resolve(strict=False)
        root = workspace.resolve(strict=True)
        if not resolved.is_relative_to(root):
            return None
        return resolved.relative_to(root).as_posix()[:PATH_LIMIT]
    except (OSError, ValueError):
        return None


def codex_evidence(stdout: str, workspace: Path) -> dict[str, Any]:
    commands: list[dict[str, Any]] = []
    file_changes: list[dict[str, Any]] = []
    command_truncated = False
    file_truncated = False
    for event in _jsonl_events(stdout):
        if event.get("type") != "item.completed":
            continue
        item = event.get("item")
        if not isinstance(item, dict):
            continue
        item_type = item.get("type")
        if item_type == "command_execution":
            if len(commands) >= EVIDENCE_ITEM_LIMIT:
                command_truncated = True
                continue
            command = item.get("command")
            if not isinstance(command, str) or not command.strip():
                continue
            record: dict[str, Any] = {
                "kind": "test" if _test_command(command) else "command",
                "command": command[:COMMAND_LIMIT],
                "command_truncated": len(command) > COMMAND_LIMIT,
                "status": item.get("status") if isinstance(item.get("status"), str) else None,
                "exit_code": item.get("exit_code") if isinstance(item.get("exit_code"), int) else None,
            }
            duration = item.get("duration_ms")
            if isinstance(duration, (int, float)) and duration >= 0:
                record["duration_ms"] = duration
            commands.append(record)
        elif item_type == "file_change":
            changes = item.get("changes")
            if not isinstance(changes, list):
                continue
            for change in changes:
                if len(file_changes) >= EVIDENCE_ITEM_LIMIT:
                    file_truncated = True
                    break
                if not isinstance(change, dict):
                    continue
                path = _safe_evidence_path(change.get("path"), workspace)
                if path is None:
                    continue
                kind = change.get("kind")
                file_changes.append({
                    "path": path,
                    "kind": kind if isinstance(kind, str) else "change",
                })
    return {
        "commands": commands,
        "commands_truncated": command_truncated,
        "file_changes": file_changes,
        "file_changes_truncated": file_truncated,
    }


def _git_output(workspace: Path, *args: str) -> str:
    process = subprocess.Popen(
        ["git", *args], cwd=workspace, stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL, text=True, encoding="utf-8", errors="replace",
        shell=False,
    )
    try:
        stdout, _ = process.communicate(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.communicate()
        raise
    if process.returncode != 0:
        raise subprocess.CalledProcessError(process.returncode, ["git", *args])
    return stdout


def _numstat(workspace: Path, *revision: str) -> tuple[list[dict[str, Any]] | None, bool]:
    try:
        output = _git_output(workspace, "diff", "--numstat", *revision, "--", ".")
    except (OSError, subprocess.SubprocessError):
        return None, False
    rows: list[dict[str, Any]] = []
    for line in output.splitlines():
        parts = line.split("\t", 2)
        if len(parts) != 3:
            continue
        if len(rows) >= EVIDENCE_ITEM_LIMIT:
            return rows, True
        added, deleted, path = parts
        rows.append({
            "path": path[:PATH_LIMIT],
            "added": int(added) if added.isdigit() else None,
            "deleted": int(deleted) if deleted.isdigit() else None,
        })
    return rows, False


def git_snapshot(workspace: Path) -> dict[str, Any]:
    try:
        if _git_output(workspace, "rev-parse", "--is-inside-work-tree").strip() != "true":
            return {"available": False}
    except (OSError, subprocess.SubprocessError):
        return {"available": False}
    try:
        head = _git_output(workspace, "rev-parse", "HEAD").strip()
    except (OSError, subprocess.SubprocessError):
        head = None
    status: list[dict[str, str]] | None = None
    status_truncated = False
    dirty: bool | None = None
    try:
        status_output = _git_output(workspace, "status", "--porcelain=v1", "--untracked-files=all", "--", ".")
        dirty = bool(status_output)
        status = []
        for line in status_output.splitlines():
            if len(line) < 3:
                continue
            if len(status) >= EVIDENCE_ITEM_LIMIT:
                status_truncated = True
                break
            status.append({"code": line[:2], "path": line[3:][:PATH_LIMIT]})
    except (OSError, subprocess.SubprocessError):
        pass
    working_diff, working_diff_truncated = _numstat(workspace, "HEAD")
    return {
        "available": True,
        "head": head[:128] if head is not None else None,
        "head_available": head is not None,
        "dirty": dirty,
        "status": status,
        "status_available": status is not None,
        "status_truncated": status_truncated,
        "working_diff": working_diff,
        "working_diff_available": working_diff is not None,
        "working_diff_truncated": working_diff_truncated,
    }


def git_evidence(workspace: Path, before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    if not before.get("available") or not after.get("available"):
        return {"available": False}
    before_head = before.get("head")
    after_head = after.get("head")
    committed_diff: list[dict[str, Any]] | None = None
    committed_diff_truncated = False
    if isinstance(before_head, str) and isinstance(after_head, str):
        if before_head == after_head:
            committed_diff = []
        else:
            committed_diff, committed_diff_truncated = _numstat(workspace, f"{before_head}..{after_head}")
    evidence = {
        "available": True,
        "head_before": before_head,
        "head_after": after_head,
        "dirty_before": before.get("dirty"),
        "dirty_after": after.get("dirty"),
        "status_after": after.get("status"),
        "working_diff": after.get("working_diff"),
        "committed_diff": committed_diff,
        "committed_diff_available": committed_diff is not None,
        "committed_diff_truncated": committed_diff_truncated,
    }
    for name, snapshot in (("before", before), ("after", after)):
        evidence[f"head_{name}_available"] = snapshot.get("head_available") is True
        evidence[f"status_{name}_available"] = snapshot.get("status_available") is True
        evidence[f"status_{name}_truncated"] = snapshot.get("status_truncated") is True
        diff_prefix = "working_diff_before" if name == "before" else "working_diff"
        evidence[f"{diff_prefix}_available"] = snapshot.get("working_diff_available") is True
        evidence[f"{diff_prefix}_truncated"] = snapshot.get("working_diff_truncated") is True
    evidence["complete"] = all(
        value is True if key.endswith("_available") else value is False
        for key, value in evidence.items()
        if key.endswith(("_available", "_truncated"))
    )
    return evidence


def execute_work(work: dict[str, Any], workspace_root: Path) -> tuple[str, dict[str, Any]]:
    metadata: dict[str, Any] = {"harness": "codex", "thread_id": None, "workspace": None,
                                "model": None, "exit_code": None}
    evidence: dict[str, Any] = {"schema_version": 1, "commands": [], "commands_truncated": False,
                                "file_changes": [], "file_changes_truncated": False,
                                "git": {"available": False}}
    try:
        workspace, config = validate_profile(work["runtime_profile_version"]["definition"], workspace_root)
        metadata.update(workspace=config["workspace"], model=config["model"],
                        reasoning_effort=config["reasoning_effort"], sandbox=config["sandbox"])
        prompt = build_prompt(work)
        before_git = git_snapshot(workspace)
        with tempfile.TemporaryDirectory(prefix="zellige-worker-") as directory:
            output = Path(directory) / "last-message.txt"
            # User config is ignored so the profile controls sandbox/model choices.
            # Project execpolicy rules are deliberately still honored.
            argv = ["codex", "exec", "--json", "--ignore-user-config", "--skip-git-repo-check",
                    "--output-last-message", str(output)]
            if config["sandbox"] == "workspace-write":
                argv.append("--approve-for-me")
            else:
                argv.extend(["--sandbox", "read-only", "-c", 'approval_policy="never"'])
            if config["model"] is not None:
                argv.append(f'--model={config["model"]}')
            if config["reasoning_effort"] is not None:
                argv.extend(["-c", f'model_reasoning_effort="{config["reasoning_effort"]}"'])
            argv.append("-")
            env = {key: value for key, value in os.environ.items() if key != "ZELLIGE_API_TOKEN"}
            process = subprocess.run(argv, input=prompt, cwd=workspace, env=env,
                                     text=True, encoding="utf-8", errors="replace",
                                     capture_output=True, shell=False)
            metadata.update(exit_code=process.returncode, thread_id=thread_id_from_jsonl(process.stdout))
            evidence.update(codex_evidence(process.stdout, workspace))
            evidence["git"] = git_evidence(workspace, before_git, git_snapshot(workspace))
            if process.returncode != 0:
                return "failed", {
                    "error": (process.stderr.strip() or f"Codex exited with code {process.returncode}")[-ERROR_LIMIT:],
                    "execution": metadata,
                    "evidence": evidence,
                }
            with output.open(encoding="utf-8", errors="replace") as final_message:
                summary = final_message.read(SUMMARY_LIMIT).strip()
            if not summary:
                raise ValueError("Codex exited successfully but returned no final message")
            return "completed", {"summary": summary, "execution": metadata, "evidence": evidence}
    except Exception as error:
        return "failed", {
            "error": f"{type(error).__name__}: {error}"[-ERROR_LIMIT:],
            "execution": metadata,
            "evidence": evidence,
        }


def run_once(client: APIClient, workspace_root: Path) -> bool:
    work = client.claim()
    if work is None:
        return False
    status, result = execute_work(work, workspace_root)

    def redact(value: Any) -> Any:
        if isinstance(value, str):
            return value.replace(client.token, "[redacted]") if client.token else value
        if isinstance(value, dict):
            return {key: redact(entry) for key, entry in value.items()}
        if isinstance(value, list):
            return [redact(entry) for entry in value]
        return value

    result = redact(result)
    if isinstance(result.get("error"), str):
        result["error"] = result["error"][-ERROR_LIMIT:]
    if isinstance(result.get("summary"), str):
        result["summary"] = result["summary"][:SUMMARY_LIMIT]
    client.finish(work["run"]["id"], status, result)
    return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Claim queued Zellige runs and execute local Codex")
    parser.add_argument("--url", default=os.environ.get("ZELLIGE_URL", "http://127.0.0.1:8787"))
    parser.add_argument("--token", default=os.environ.get("ZELLIGE_API_TOKEN"))
    parser.add_argument("--workspace-root", type=Path, default=os.environ.get("ZELLIGE_WORKSPACE_ROOT"))
    parser.add_argument("--poll-interval", type=float, default=2.0)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args(argv)
    if not args.token:
        parser.error("--token or ZELLIGE_API_TOKEN is required")
    if args.workspace_root is None:
        parser.error("--workspace-root or ZELLIGE_WORKSPACE_ROOT is required")
    if not math.isfinite(args.poll_interval) or args.poll_interval <= 0:
        parser.error("--poll-interval must be a positive finite number")
    try:
        root = args.workspace_root.resolve(strict=True)
        if not root.is_dir():
            raise ValueError("workspace root must be a directory")
        client = APIClient(args.url, args.token)
        while True:
            claimed = run_once(client, root)
            if args.once:
                return 0
            if not claimed:
                time.sleep(args.poll_interval)
    except KeyboardInterrupt:
        return 130
    except Exception:
        print("Worker stopped: configuration or HTTP operation failed; inspect runs before restarting.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
