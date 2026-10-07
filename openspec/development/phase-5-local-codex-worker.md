# Phase 5: local Codex worker

Zellige queues runs through the existing UI. A separate local worker claims work
through authenticated HTTP and executes the installed Codex CLI non-interactively.
The worker never opens SQLite. This phase adds no database migration.

## Workflow

1. Install dependencies (`uv sync --frozen`) and build the web app. Install and
   authenticate Codex on the worker host. Codex authentication and model access
   are separate from the Zellige API token.
2. Start the daemon with `ZELLIGE_API_TOKEN`. Connect in Settings with the same
   token and create a **Codex local** runtime profile.
3. Save a meaningful user request, select that profile and choose **Encolar**.
   The input head and referenced versions are pinned at run creation.
4. Start the worker in a separate terminal:

   ```sh
   export ZELLIGE_API_TOKEN='same-token-as-the-daemon'
   export ZELLIGE_WORKSPACE_ROOT='/absolute/path/to/allowed/workspace'
   uv run zellige-worker --url http://127.0.0.1:8787
   ```

5. Open Inspector and choose **Sincronizar cambios** to refresh the Thread and
   runs. States, summaries and errors update through the existing manual cursor
   synchronization. There is no automatic browser polling.

`--url`, `--token` and `--workspace-root` override `ZELLIGE_URL`,
`ZELLIGE_API_TOKEN` and `ZELLIGE_WORKSPACE_ROOT`, respectively. The default URL
is `http://127.0.0.1:8787`; a workspace root is required. Prefer the token
environment variable to avoid placing credentials in shell history or process
arguments. `--poll-interval` sets the positive finite idle interval in seconds
(default `2`). The worker sleeps only when no matching work is available.

`uv run zellige-worker --once` makes one claim attempt and exits, including when
the queue is empty. It returns zero after a handled run even if execution failed;
inspect the run's terminal status. HTTP/configuration failures return nonzero,
and interruption returns `130`.

## Runtime profile and workspace boundary

Settings creates this immutable definition:

```json
{"mode":"code","harness":"codex","workspace":".","sandbox":"workspace-write"}
```

Profiles created through `POST /v1/runtime-profiles` may also specify:

```json
{
  "mode": "code",
  "harness": "codex",
  "workspace": "my-repository",
  "model": "your-available-codex-model",
  "reasoning_effort": "high",
  "sandbox": "workspace-write"
}
```

`workspace` defaults to `.` and must resolve to an existing directory beneath
the required root. Absolute paths, `..` components and symlink-resolved escapes
are rejected. Internal symlinks resolve to their canonical relative path.
The operator must control the directory tree and keep symlink targets stable
during execution. The selected directory must satisfy Codex CLI's normal repository
checks. This boundary selects the working directory; Codex's sandbox and project
execpolicy rules continue to control model-generated commands.

`model` is optional and must be a non-empty string. `reasoning_effort` accepts
only `low`, `medium`, `high` or `ultra`. `mode` is an optional non-empty string.
`sandbox` defaults to `read-only`; the only other option is `workspace-write`.
Unknown fields, arbitrary executable/argv/shell and `danger-full-access` are
rejected. Run request data cannot configure the process.

The installed CLI must support `codex exec --json --output-last-message` and
`--ignore-user-config`. Read-only execution sets `--sandbox read-only` and
`approval_policy="never"`. Workspace writes use `--approve-for-me`, the installed
CLI's automatic approval review. Project execpolicy rules are not bypassed;
authentication still comes from local Codex credentials. Local execpolicy rules remain in force. The operator must trust
the workspace instructions and restrict the root to allowed directories.

## HTTP and execution contract

Both endpoints require `Authorization: Bearer <ZELLIGE_API_TOKEN>`:

- `POST /v1/runner/runs/claim` with `{"harness":"codex"}` returns
  `{"work":null}` with HTTP 200 if no exact referenced profile version matches.
  Legacy profiles without a harness stay queued. Otherwise it returns the
  running run, its exact profile version, items from root through
  `run.input_head_item_id`, and context versions in stored ordinal order.
  A null input head means no items, even if the branch later advances.
- `POST /v1/runner/runs/{run_id}/finish` takes
  `{"status":"completed","result":{...}}` or `failed`. Only a running run can
  finish: queued/terminal runs return 409, unknown runs return 404.

Claims serialize under `BEGIN IMMEDIATE`, select by oldest `created_at,id` and
cannot give competing claimers the same run. Each queued/running/terminal
transition writes the complete run upsert to the outbox in the same transaction.
Finish preserves the start timestamp and all runtime references.

The deterministic prompt includes all pinned items, ordered context versions and
manifests, and optional string `run.request.instructions`. It asks Codex to execute
the latest user request represented by the snapshot. No meaningful user text or
instructions causes failure before launching Codex; context manifests or
artifact-only input do not supply a task. The process uses fixed subprocess argv,
stdin and `shell=False`.

Success stores `result.summary` (up to 64,000 characters) and `result.execution`:
`harness`, nullable native `thread_id`, canonical relative `workspace`, nullable
`model`, reasoning effort, sandbox and `exit_code`. Nonzero exits and execution
exceptions finish as failed with an error limited to 8,000 characters. Unknown
JSONL events are ignored; native thread/session IDs are extracted best-effort and
limited to 256 characters. An absent/empty final message fails clearly.
Canonical `provider_session_id` linkage remains deferred.

The API token is excluded from the Codex environment and redacted from persisted
result values. The worker does not log tokens, prompts or subprocess output.
HTTP diagnostics exclude response bodies, URLs and headers; redirects are
refused to prevent forwarding credentials.

## Limits

A worker crash, interrupted execution or failed/ambiguous finish request may leave
a run `running`. HTTP errors stop the worker without automatic retry or requeue;
inspect persisted runs before restarting because a transition may already have
committed. A successfully reported execution failure does not stop continuous
processing. There is no execution timeout or managed cancellation of Codex and
its child tools.

Results stay on the run; this phase does not append assistant items or resume
native sessions. Tests fake HTTP/process execution and never invoke a real model;
production execution calls the installed CLI.

The supported workflow is one local worker per trusted installation. Tasks,
leases/heartbeats/recovery, cancel/retry, provider-session CRUD, multi/remote-worker
orchestration, automatic sync, SSE/WebSocket, rich events/artifacts/diffs/tests
viewers, MCP, schedules and GitHub ingestion remain deferred.
