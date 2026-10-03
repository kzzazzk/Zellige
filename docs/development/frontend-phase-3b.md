# Frontend Phase 3B: manual cursor synchronization

Phase 3B builds on the Phase 3A OpenAPI contract (`c78472f`). The Inspector's
**Sincronizar cambios** action uses the shared workspace operation gate to drain
`GET /v1/changes` from the saved cursor through the first observed page with
`has_more=false`. Concurrent writes can continue after that observation; this
does not establish a stable endpoint state.

Changes are invalidation signals, not DTO patches. The API boundary classifies
only metadata: conversation-scoped changes refresh the filtered list, and changes
for the selected conversation also refresh its captured branch/thread. Runtime
profile and profile-version changes refresh profiles. Unknown scoped types also
refresh profiles conservatively. Other global changes refresh the list, profiles
and selected thread. Deletes use the same authoritative-read path; a failed
read, including a missing selected
conversation, leaves the cursor unacknowledged for retry.

Required reads run in parallel and stage their results before any canonical state
is applied. A drain or refresh failure preserves the list, thread, profiles,
displayed changes and cursor. Successful synchronization applies staged state,
records the accumulated changes for diagnostics, clears `hasMoreChanges`, then
acknowledges the cursor last. The captured thread refresh is applied internally even if browser history changes
while synchronization is in flight. Phase 2 already hides the captured thread
while route intent is pending and resolves any different destination after the
gate is released. Keeping the authoritative captured refresh prevents an
acknowledged invalidation from being lost when history returns to the same
conversation and branch before synchronization completes. Submitted list
filters, drafts and profile selection retain their existing behavior.

Diagnostic recording remains selective: synchronization records the accumulated
outbox result after successful application; failures use the existing error
path. Disconnect resets the cursor, displayed changes and `hasMoreChanges`.
This supersedes the changes-read/reset behavior documented for Phase 1.

Synchronization is manual. Automatic transport, polling/background sync, true
run-output streaming, a Query cache migration and outbox pruning/generation
protocols are deferred. No SSE, WebSocket, long-poll, runner integration or
backend semantic changes are introduced.
