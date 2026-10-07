# Phase 7: active Run auto-sync

Phase 7 removes the manual-refresh requirement from the normal local Codex workflow without adding a new backend protocol.

## Product behavior

When the selected conversation contains at least one Run in `queued` or `running`, the browser automatically synchronizes from the existing `/v1/changes` cursor.

The first attempt happens when an active Run becomes visible. Subsequent attempts run every 1.5 seconds while an active Run remains. Synchronization stops when all Runs in the selected Thread are terminal, when the user leaves that Thread, or when the session disconnects.

The existing **Sincronizar cambios** control remains available as a manual fallback.

Typical flow:

`queued → running → completed/failed → Phase 6 review evidence`

No click on the manual synchronization control is required.

## No backend or worker changes

Phase 5 already publishes complete Run upserts for queued, running and terminal transitions through the existing changes outbox. Phase 6 already persists the final review evidence in `run.result`.

Phase 7 therefore adds no:

- database migration;
- backend endpoint;
- OpenAPI change;
- worker protocol;
- run-event table;
- SSE/WebSocket transport.

## Background synchronization semantics

Automatic synchronization reuses the Phase 3B algorithm:

1. drain `/v1/changes` from the last acknowledged cursor;
2. classify changes only as invalidation signals;
3. stage every required authoritative read;
4. verify the background attempt is still current;
5. publish the staged canonical Query state;
6. acknowledge the cursor last.

`Change.data` is still never trusted as the authoritative DTO.

## Foreground actions win

Background synchronization does not set the global `busy` state and does not disable the workspace.

Every foreground operation increments a revision. A background attempt captures the revision and the live route request before it starts. Before publication it verifies both again. If the user begins a foreground operation, opens a new chat, disconnects, or browser history moves while background reads are in flight, that background attempt becomes stale even if React has not run effect cleanup yet.

A stale attempt discards every staged read and does not advance the cursor. Disabling or unmounting the auto-sync also invalidates any network read already in flight. The next eligible synchronization replays from the same cursor.

This allows user actions to remain responsive without letting old background reads overwrite newer state.

Only one background synchronization attempt may run at once. If a foreground operation is already active, the automatic attempt is skipped and the next scheduled tick can try again.

## Error behavior

Automatic synchronization failures are non-destructive and do not replace the foreground error surface. The cursor remains unacknowledged, so a later tick can retry the read safely.

This is automatic retry of an idempotent synchronization read, not automatic retry of mutations or worker transitions.

## TanStack Query ownership

Phase 4 remains intact: QueryCache is the single canonical owner for conversation pages, Threads and profiles.

Background synchronization stages network reads outside the live cache and only publishes after the whole batch succeeds and remains current. It does not add query functions, polling to Query itself, focus refetches, retries or a second Run cache.

## Scope boundary

This phase intentionally provides state-level liveness, not command-by-command execution streaming.

Deferred:

- first-class append-only Run events;
- SSE/WebSocket/live event transport;
- stdout/stderr streaming;
- full diff viewer;
- Run artifacts as first-class links;
- cancellation/retry/requeue;
- leases, heartbeats and abandoned-Run recovery;
- remote or multi-worker scheduling;
- Task entity;
- MCP, schedules and GitHub ingestion.

A future live-event phase should be justified by the need to display incremental execution activity that `/v1/changes` plus authoritative Run refreshes cannot represent.
