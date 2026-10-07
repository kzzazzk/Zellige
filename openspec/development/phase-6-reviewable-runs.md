# Phase 6: reviewable runs

Phase 6 makes completed local Codex runs reviewable without adding streaming or a new persistence table.

## Product workflow

After a Codex run finishes, the existing manual **Sincronizar cambios** flow refreshes the canonical Run. Inspector now renders a compact review record alongside the final summary/error:

- completed command invocations reported by Codex JSONL, with explicit clipping indicators;
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
- a command is labelled as a test only when `shlex.split` parses a simple invocation whose executable/arguments identify a known runner; matching is case-sensitive, and executable paths use the exact basename;
- exit code is retained exactly; Zellige never infers that tests passed from the agent prose;
- `file_change` paths are normalized to the configured workspace and paths outside it are discarded;
- command output is not persisted, avoiding large or secret-bearing stdout/stderr retention;
- up to 2,048 characters of each command string are persisted for review and must therefore be treated as sensitive run data; each record has `command_truncated: true` only when the original exceeds that limit (exactly 2,048 characters is not truncated);
- the final Codex summary remains separate from execution evidence.

Recognized argv forms are `pytest`, `vitest`, `jest`, `python`/`python3 -m pytest|unittest`, `npm test`, `npm run test`, `npm run test:<name>` (nonempty name), `pnpm|yarn|bun|cargo|go|dotnet test`, and `gradle|gradlew test`. Maven (`mvn`/`mvnw`) supports `test` preceded by `clean`, `validate`, `compile`, `test-compile`, attached `-D...`/`-P...` options, or the switches `-q`/`--quiet`, `-B`/`--batch-mode`, `-e`/`--errors`, `-X`/`--debug`, `-o`/`--offline`. Other Maven prefixes are conservatively unclassified, including options whose values could be confused with a test goal.

Shell text containing `;`, `&`, `|`, `<`, `>`, newlines/CR, backticks, `$`, parentheses, braces, backslashes or `#` is ordinary command evidence, even inside quotes. This rejects compounds, redirects, substitution, continuations and control syntax; false negatives are preferable to false test-passed evidence. A single `bash|sh|zsh|fish -lc <body>` wrapper is supported only with exactly those three argv elements and a body that itself parses as a simple test invocation. Nested wrappers are not classified. `echo "example; pytest"`, `echo pytest`, `false && npm test`, `npm test || true`, `pytest-fake`, and `npm test:unit` are ordinary commands regardless of their reported exit code. Classification uses the full original string before clipping.

Codex JSONL is treated as an integration surface, not as a stable Zellige domain schema. Unknown event types are ignored. Evidence is capped at 100 command and 100 file-change entries. `commands_truncated` indicates omitted command **records only**, independently of each record's `command_truncated`; `file_changes_truncated` indicates omitted file-change records. Exactly 100 entries is not list truncation.

## Git review evidence

Git inspection is read-only and uses fixed argv calls with `shell=False`, never shell strings. `rev-parse --is-inside-work-tree` probes repository availability; HEAD, status and numstat are then read independently.

Before and after Codex execution the worker captures:

- current HEAD;
- whether the selected workspace is dirty;
- bounded porcelain status after the run;
- `git diff --numstat HEAD -- .` for remaining working-tree changes;
- when HEAD changes, `git diff --numstat <before>..<after> -- .` for committed changes.

Full patches and file contents are not persisted in this phase. A non-Git workspace, unavailable Git executable or failed repository probe keeps `git.available: false`. Once the repository probe succeeds, a failed sub-read keeps `available: true` but records unavailable evidence rather than an ordinary empty result. Runs complete normally regardless of Git read failures.

Snapshot HEAD/status/working-diff success is explicit (`head_available`, `status_available`, `working_diff_available`). Failed HEAD is `null`; failed status is `null` with `dirty: null`; failed numstat is `null`. Successful empty status/diffs are `[]` and successful empty status means `dirty: false`.

Persisted Git evidence includes `head_before_available`, `head_after_available`, `status_before_available`, `status_after_available`, `working_diff_before_available`, `working_diff_available` (after), and `committed_diff_available`. Status and numstat lists are capped at 100 rows, with explicit `status_before_truncated`, `status_after_truncated`, `working_diff_before_truncated`, `working_diff_truncated` (after), and `committed_diff_truncated` flags. Exactly 100 rows is complete; an additional row sets the corresponding flag. Before-state status/diff rows are not persisted, but their read/completeness flags are retained.

The committed diff is `[]` and available when both HEAD reads succeed and are equal; differing HEADs trigger the bounded numstat read. A failed committed-diff read or unavailable HEAD makes `committed_diff: null` and `committed_diff_available: false`.

`git.complete` is true only when every before/after HEAD, status and working-diff read and the committed-diff evidence is available, with no list truncation. The UI marks evidence incomplete for failed sub-reads, truncated lists or older evidence without a completeness flag. It labels unavailable after-status/diffs and truncated lists explicitly. It says the workspace ended with no pending Git changes only when `complete: true`, `dirty_after: false`, and all displayed Git lists are empty.

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
