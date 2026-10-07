# Frontend Phase 2: typed routing and URL-driven workspace

## Route contract and ownership

The code-defined TanStack Router v1 tree is:

```
root (persistent workspace shell)
├── /                       new/empty workspace
└── /chat/$conversationId   concrete requested conversation
```

`@tanstack/react-router` is the only new direct runtime dependency, pinned to
**1.170.41**. There are no loaders, server objects in router context/cache,
file-route plugins, devtools, hash routes or branch query parameters.

`App` constructs one router per mount and accepts router-exported `RouterHistory`
for tests. `router.tsx` declares typed navigation and typed ID-only branch history
metadata. TanStack's `InnerWrap` mounts `WorkspaceApp` synchronously and keeps it
mounted independently of asynchronously resolved route matches. This preserves
the existing directly rendered App contract and keeps shell, Chat, theme and
settings ownership stable. The shell extraction has no redesign.

`useWorkspaceNavigation` matches the encoded location href against the declared
route tree, so opaque IDs (including spaces, Unicode, literal percent sequences
and encoded slashes) are decoded once. History entry keys identify requests
without comparing encoded history paths to decoded router display paths. It
maps location to narrow identity intent and performs typed push/replace navigation. Its `useWorkspaceRoute` coordinator resolves route
reads through the existing synchronous workspace operation gate. It stores no
second selected ID or thread. Workspace owners still own credentials, committed
thread, branches, lists, runs, profiles, drafts, diagnostics and persistence.
Standalone `useWorkspace()` retains Phase 1 saved-selection behavior.

## Startup and persistence

In routed mode, credential bootstrap validates list/profiles without restoring
the saved thread. Once connected, the coordinator resolves the latest URL under
the same operation gate. This deliberately separates credential validity from
route-read validity: a missing conversation does not invalidate a valid token.
A deep link without credentials remains requested until successful connection.
Failed reconnect retains the old credentials, thread and location.

`/` explicitly overrides a saved conversation and never creates a conversation.
For the initial matching concrete URL, the saved branch is eligible. Subsequent
entries use their ID-only branch hint or the first branch. `loadThread` remains
authoritative, including missing-branch fallback and returned history branch.

Persistence is suspended while route identity (including a requested branch hint)
and committed identity differ.
The key `zellige-mvp-session-v1` and token/conversationId/branchId/cursor schema
are unchanged. Drafts remain in-memory per conversation/branch and reset on
successful reconnect/disconnect; profile choice is not persisted.

## Navigation lifecycle

Sidebar selection navigates once; it does not separately select/load the thread.
New chat clears the active thread/error immediately and pushes `/`, preserving
the `new` draft. Header branch changes and explicit fork events replace the
entry's branch hint without pushing branch-only history entries. Already loaded
conversations are not redundantly reloaded by branch-hint replacement. Returning
to a distinct entry with the same conversation but a different branch hint resolves
that branch through the shared gate, including coalesced navigation during writes.

First-message creation emits an explicit workflow event, adopting its URL before
append finishes. Thus failed append still leaves the created conversation and
transferred draft accessible. Successful append with failed refresh retains
Phase 1 partial-success semantics; no write is automatically retried.

While the shared gate is occupied, browser history retains the latest request.
After captured append/fork work finishes, the coordinator resolves that latest
request. History request keys distinguish A → B → A generations. Route reads
check request identity and mounted lifetime before committing a thread, error or
recovery. Creation and branch notifications cannot overwrite newer navigation.
Navigation callbacks also stop after shell unmount.

Unresolved route transitions disable controls and synchronously guard callbacks;
the old thread/draft is not presented as the newly requested conversation.
The internally committed thread is retained for failure recovery and draft
isolation. Diagnostic actions share the guarded operation path.

Unknown/malformed shapes and failed reads replace the requested URL with the
last committed conversation and its branch hint (or `/`). Existing accessible alerts remain visible
through recovery. Missing-conversation handling uses HTTP 404, not an API-specific
error code. Network/401/500 failures remain visible without retries or silent
credential replacement. Sidebar pagination/filtering/archive visibility never
determines existence. Settings, inspector and naming remain overlays; drawer
selection continues closing the mobile drawer.

## Scope and verification

No backend, API, session-schema, styling, Vite, infrastructure, deployment, CI or
Phase 1 documentation changes are required. Production direct-open/refresh is
**not delivered**: Starlette `StaticFiles(html=True)` does not return the SPA entry
for arbitrary paths. A future backend/deployment fallback is prerequisite work.
Phase 3/backend integration and interactive desktop/mobile browser review remain
separate work; automated DOM tests are not a claim of manual visual review.

The original 50 tests are retained. Additional memory-history and browser-history
fixture tests cover URL precedence, concrete refresh and saved branches, archived
links, missing branches, malformed shapes, 404/401/500/network failure recovery,
draft/session retention, sidebar pushes, branch replacement, POP, mobile drawer,
overlay behavior, disconnected deep-link connection, deferred bootstrap/route
reads/append/fork/creation, superseded failure, Strict Mode, unmount, partial
success, failed reconnect and disconnect reset.

Required commands:

```
npm --prefix web run lint
npm --prefix web run typecheck
npm --prefix web test
npm --prefix web run build
git diff --check
git status --short --branch
```

Also check Vite returns HTML containing `/src/main.tsx` at `/chat/example`.
Fixture-backed direct-link tests verify client resolution separately from that
HTTP hosting check. Interactive browser review is unperformed when no interactive
browser tool is available.

Recorded final verification on `frontend-v2-phase2`: lint and typecheck passed;
13 test files / 89 tests passed (including all original 50). Production build
passed with a non-fatal 520.14 kB JavaScript chunk-size warning; working-tree and
staged diff whitespace checks passed. Vite returned HTTP 200 SPA HTML containing
`/src/main.tsx` at `/chat/example`. Additional regression tests cover encoded opaque
IDs, encoded unknown-ID recovery, same-conversation history jumps restoring branch
and draft, malformed-route branch retention, and branch restoration after a
captured append. Manual interactive browser review was not performed. All changes
remain uncommitted; pre-existing `.agents/` and `.pi/` artifacts were left untouched.
