# Phase 6: reviewable runs

Phase 6 makes completed local Codex runs reviewable without adding streaming or a new persistence table.

## Product workflow

After a Codex run finishes, the existing manual **Sincronizar cambios** flow refreshes the canonical Run. Inspector now renders a compact review record alongside the final summary/error:

- exact completed command invocations reported by Codex JSONL;
- conservative test-command classification plus the real exit code;
- file-change items reported by Codex;
- Git HEAD and dirty-state before/after execution;
- bounded Git status and numstat summaries after execution.

The evidence is persisted inside the existing `run.result` JSON object, so it survives reloads and is carried by the existing Run upsert in `/v1/changes`.

## Persisted evidence

The worker stores an `evidence` object with `schema_version: 1`, bounded `commands`, bounded `file_changes`, and a `git` summary containing the before/after HEAD, dirty state, status rows and numstat rows. Phase 5 results without evidence remain valid and render normally.

## Evidence rules

Evidence is deliberately factual rather than inferred:

- only terminal `item.completed` `command_execution` events become command evidence;
- a command is labelled as a test only when its literal command matches a conservative list of common test runners;
- exit code is retained exactly; Zellige never infers that tests passed from the agent prose;
- `file_change` paths are normalized to the configured workspace and paths outside it are discarded;
- command output is not persisted, avoiding large or secret-bearing stdout/stderr retention;
- the exact command string is persisted for review and must therefore be treated as sensitive run data;
- the final Codex summary remains separate from execution evidence.

Codex JSONL is treated as an integration surface, not as a stable Zellige domain schema. Unknown event types are ignored. Evidence is capped at 100 command and 100 file-change entries and truncation is recorded.

## Git review evidence

Git inspection is read-only and uses fixed argv calls, never shell strings.

Before and after Codex execution the worker captures:

- current HEAD;
- whether the selected workspace is dirty;
- bounded porcelain status after the run;
- `git diff --numstat HEAD -- .` for remaining working-tree changes;
- when HEAD changes, `git diff --numstat <before>..<after> -- .` for committed changes.

Full patches and file contents are not persisted in this phase. If the workspace is not a Git repository, Git is unavailable, or Git inspection fails, the Run completes normally and the UI states that Git evidence is unavailable.

A dirty workspace at the start is surfaced explicitly so after-state changes are not falsely attributed entirely to the Run.

## UI

Inspector remains the review surface for now; routing does not change. Each Run can show the final summary/error, command/test evidence and exit codes, file changes reported by Codex, and Git before/after metadata plus changed-file counts. Raw server diagnostics remain under the existing technical details section.

## Why no run-events table yet

This phase is post-run review, not live progress. `run.result` is already durable, synchronized and query-cached, so a new event table would add migration/API/query complexity without changing the user workflow.

A first-class append-only run-event stream should arrive together with automatic/live synchronization (SSE/WebSocket or equivalent), when incremental delivery, pagination, replay and retention become product requirements.

## Deferred

- live progress and streaming;
- automatic background synchronization;
- first-class run-event persistence;
- full patch/diff viewer;
- command stdout/stderr retention;
- artifacts attached directly to Runs;
- cancellation, retry, leases and abandoned-run recovery;
- remote/multi-worker scheduling;
- provider-session CRUD;
- Task entity;
- MCP orchestration, scheduled tasks and GitHub issue ingestion.
