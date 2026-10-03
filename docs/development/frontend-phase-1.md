# Frontend Phase 1: ownership and preserved behavior

This structural refactor targets the existing API contract at
`a5c76598db0f76b4599a6cb1f0a3df555c67c599` on `frontend-v2-refactor`.
It adds no architecture dependencies and makes no backend-contract changes.
Steps 1–2 (fixture characterization and pure helpers) were already in the working
tree when the Step 3–10 continuation began; their changes were retained.

## Ownership

- `App.tsx` is the composition root: one `useWorkspace()` instance, simple overlay
  booleans, and explicit wiring to views.
- `app/` contains shell presentation, theme persistence and naming prompt state.
- `components/Chat.tsx` retains edit item/text/conversation state and shared focus
  and scroll refs. `components/chat/` contains history, message, empty state,
  composer and controlled edit-panel presentation. Clipboard feedback is local
  to each message. Chat is keyed only by connected/disconnected, not selection.
- `features/useWorkspace.ts` composes state and operation groups, coordinates
  cross-slice connection/disconnection resets, and keeps the migration API.
- `useWorkspaceSession` owns the saved snapshot, token, connected flag,
  cancellation-guarded bootstrap and session persistence.
- `useWorkspaceOperation` owns the single synchronous ref gate, busy, failure,
  selective response recording and error normalization. Saved-token bootstrap
  starts with the same gate held. Competing actions return `false` immediately.
- `useConversationState` is the sole selected-thread and list/filter owner.
  Runs remain within the selected thread, not an independent writable collection.
- `useDrafts` owns an in-memory dictionary keyed by conversation and branch
  (or `new`); transfer and clear take explicit target keys.
- `useExecutionState` owns profiles, selected profile-version ID and one queued
  notice key. `useDiagnostics` owns the displayed changes page and cursor.
- `conversationActions`, `messageActions`, `executionActions`, and
  `connectionActions` own endpoint ordering and partial-success handling, with
  narrow dependencies and current-render snapshots. Views never make HTTP calls.
- `api/` remains the wire-contract/transport boundary. `Thread` and `Failure`
  are frontend coordination types, not duplicated domain models.

## Request ordering and safety ledger

### Connection and restore

Candidate credentials are trimmed and used with a candidate-token-bound client.
Conversation and profile reads must succeed before replacing the active session.
Successful connection resets drafts, selection, queue notice, submitted filters
and selected profile version. Failed reconnect retains the old session.

Restore reads list and profiles in parallel, then optionally loads the saved
thread. `loadThread` reads conversation, branches and conversation-level runs in
parallel, selects the requested or first branch, then reads history; history's
returned branch is authoritative. A 404 during saved-thread restoration is
swallowed as before. Other restoration failures remain visible. Persistence
waits while a nonempty token is not connected, preventing premature selection
loss. Unmount and Strict Mode effect cleanup ignore late bootstrap completion.

### Sending and branching

1. Capture the text and target thread.
2. If necessary, create one conversation and select it; transfer the `new` draft.
3. Append once with the captured expected head, including explicit `null`.
4. Immediately commit the returned item/head and clear only the target draft.
5. Refresh list, then target thread.

Append conflicts preserve the draft and refresh without retry. A failed recovery
read preserves the original append conflict. After a successful append, follow-up
read failure produces the existing saved/refresh-needed warning, not a failed
send or duplicate append.

Branch-from-message uses that item's ID. Edit-as-branch uses the original item's
**parent** and appends the replacement only after branch creation and load.
Partial failure leaves the created branch selected; the Chat editor remains
until successful save. Editor visibility is conversation-scoped, not
branch-scoped. There is no automatic rollback or retry.

### Other workflows

- Search commits submitted query/filter only after a successful list read;
  Sidebar input text remains independent local form state.
- Pagination uses current list length as offset and de-duplicates against IDs
  already displayed. Refresh preserves its captured branch and partial commits.
- Metadata updates use `expected_updated_at`; 409 reloads without retry.
- Queue requests capture branch and profile-version IDs, prepend the returned
  run once, and scope the single notice to the current conversation/branch key.
  Queueing does not fabricate assistant output.
- Changes reads are manual, replace the displayed page, and advance the persisted
  cursor and `has_more`. They do not synchronize conversation state.
- `newChat()` creates nothing on the server and does not clear the `new` draft.
  Drafts and profile selection are not persisted across reloads.
- Diagnostic recording is intentionally selective; no transport interceptor was
  introduced to change what “last response” means.

## Verification and review boundaries

Focused automated coverage includes presentation formatting/clipboard feedback,
composer Enter/Shift+Enter/IME behavior, suggestions/focus without sending,
conversation-scoped editor retention and failed/successful edit submissions,
theme storage failures, naming prompt closure, synchronous gate acquisition and
release, explicit-key draft transfer/clear, cancellation and Strict Mode restore,
and API-backed mutation safety characterization. Existing application journeys
remain in place.

Final checks passed: lint, TypeScript, 50 frontend tests across 11 files,
production build and `git diff --check`. The backend integration smoke command
could not run because `uv` is unavailable in this environment; no backend files
were changed to work around that limitation. Terminal-based verification is not a substitute for
manual desktop/mobile light/dark appearance, scrolling, keyboard/dialog/drawer
focus, and reduced-motion review: that manual review remains a handoff item.
The final validation counts/results are reported with the delivery, rather than
claiming that feature-branch CI or browser review has run.

## Known baseline behavior and deferred work

- Metadata recovery can surface a recovery-read error instead of the initial
  conflict. This differs deliberately from append conflict recovery.
- Disconnect leaves archived-filter and `hasMoreChanges` state unchanged;
  reconnect does not reset all diagnostics. Sidebar input has a separate lifecycle.
  These inconsistencies were preserved, not corrected during extraction.
- Edits are multiple requests, not atomic; failed replacement can leave a branch.
- Wire types do not validate response JSON at runtime; fixture agreement alone
  does not establish backend compatibility.
- No router, query cache, per-resource concurrency, automatic retry/polling,
  persisted drafts, domain mapping layer, streaming or runner output was added.
- Backend adaptation must be separate and based on agreed contracts, not
  speculative dual-stack behavior.

All continuation changes are intentionally left uncommitted. A subsequent PR,
not a direct merge to `main`, is the delivery path.
