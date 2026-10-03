"""Local Codex runner. Canonical state is accessed exclusively through HTTP."""
from __future__ import annotations

import argparse
import json
import math
import os
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
            # Server bodies, URLs and headers are deliberately excluded from diagnostics.
            # Close the error body so cleanup cannot emit its unsanitized repr.
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


def thread_id_from_jsonl(stdout: str) -> str | None:
    for line in stdout.splitlines():
        try:
            event = json.loads(line)
        except (ValueError, TypeError):
            continue
        if not isinstance(event, dict):
            continue
        for key in ("thread_id", "session_id"):
            if isinstance(event.get(key), str) and event[key]:
                return event[key][:256]
        if event.get("type") in {"thread.started", "session.started"}:
            for key in ("thread", "session"):
                native = event.get(key)
                if isinstance(native, dict) and isinstance(native.get("id"), str) and native["id"]:
                    return native["id"][:256]
    return None


def execute_work(work: dict[str, Any], workspace_root: Path) -> tuple[str, dict[str, Any]]:
    metadata: dict[str, Any] = {"harness": "codex", "thread_id": None, "workspace": None,
                                "model": None, "exit_code": None}
    try:
        workspace, config = validate_profile(work["runtime_profile_version"]["definition"], workspace_root)
        metadata.update(workspace=config["workspace"], model=config["model"],
                        reasoning_effort=config["reasoning_effort"], sandbox=config["sandbox"])
        prompt = build_prompt(work)
        with tempfile.TemporaryDirectory(prefix="zellige-worker-") as directory:
            output = Path(directory) / "last-message.txt"
            # These flags are supported by the installed CLI; keep local rules
            # from overriding sandbox policy and permit non-Git workspaces.
            argv = ["codex", "exec", "--json", "--ignore-user-config", "--ignore-rules",
                    "--skip-git-repo-check",
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
            # The API credential is not needed by Codex or its child tools.
            env = {key: value for key, value in os.environ.items() if key != "ZELLIGE_API_TOKEN"}
            process = subprocess.run(argv, input=prompt, cwd=workspace, env=env,
                                     text=True, encoding="utf-8", errors="replace",
                                     capture_output=True, shell=False)
            metadata.update(exit_code=process.returncode, thread_id=thread_id_from_jsonl(process.stdout))
            if process.returncode != 0:
                return "failed", {"error": (process.stderr.strip() or f"Codex exited with code {process.returncode}")[-ERROR_LIMIT:],
                                  "execution": metadata}
            with output.open(encoding="utf-8", errors="replace") as final_message:
                summary = final_message.read(SUMMARY_LIMIT).strip()
            if not summary:
                raise ValueError("Codex exited successfully but returned no final message")
            return "completed", {"summary": summary, "execution": metadata}
    except Exception as error:
        return "failed", {"error": f"{type(error).__name__}: {error}"[-ERROR_LIMIT:], "execution": metadata}


def run_once(client: APIClient, workspace_root: Path) -> bool:
    work = client.claim()
    if work is None:
        return False
    status, result = execute_work(work, workspace_root)
    # Redact the API token even if a child or a profile included it in output.
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
        # Claim/finish failures may be ambiguous: stop without retrying or requeuing.
        print("Worker stopped: configuration or HTTP operation failed; inspect runs before restarting.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
