# Zellige

Zellige is an open-source, self-hosted conversation service. It keeps one
provider-neutral conversation model while allowing different execution profiles
for general chat, coding, research, and durable personal agents.

This repository contains the server-side SQLite proof of concept and a small
conversation web app. The server remains deliberately small: FastAPI, an
authenticated HTTP API, a single daemon-owned database, and content-addressed
artifact storage.

## What the PoC proves

- Canonical conversations with branches and immutable structured items.
- Atomic optimistic appends using `expected_head_item_id` and HTTP 409 conflicts.
- Runs tied to immutable runtime-profile and context-pack versions.
- A separate HTTP worker executes local Codex against pinned run snapshots.
- WAL, foreign keys, short write transactions, and restart persistence.
- A transactional `changes` outbox for cursor-based incremental sync.
- Artifact bytes stored outside SQLite by SHA-256.

The data model and its current limits are documented in
[`docs/architecture/database.md`](docs/architecture/database.md). The formal v1
item contract is [`schemas/item-payload.schema.json`](schemas/item-payload.schema.json).

## Run locally

Python 3.12 or later and [uv](https://docs.astral.sh/uv/) are required. Install
the locked dependencies, then provide the only required secret, an API token:

```sh
uv sync --frozen
export ZELLIGE_API_TOKEN='replace-with-a-long-random-value'
uv run zellige
```

The daemon listens on `127.0.0.1:8787` by default and stores state under
`./data`. `GET /health` is unauthenticated; every `/v1` endpoint requires
`Authorization: Bearer <token>`.

The live OpenAPI 3.1 contract is available at `/openapi.json`. Interactive
documentation is served through Swagger UI at `/docs` and ReDoc at `/redoc`.
Swagger's **Authorize** action accepts the same bearer token as every `/v1`
endpoint. The OpenAPI document is fully local; the current Swagger and ReDoc
HTML pages still load their JavaScript and CSS assets from a public CDN, so
those assets must be bundled before supporting air-gapped installations.

Create a conversation:

```sh
curl -sS http://127.0.0.1:8787/v1/conversations \
  -H "Authorization: Bearer $ZELLIGE_API_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"title":"First conversation"}'
```

Run the local Codex worker in a second terminal after Codex CLI is installed and
authenticated. The workspace root is a security boundary: profiles can only
select relative directories beneath it.

```sh
export ZELLIGE_API_TOKEN='replace-with-the-same-value'
export ZELLIGE_WORKSPACE_ROOT='/path/to/allowed/workspace'
uv run zellige-worker
```

Use `uv run zellige-worker --once` to claim at most one queued Codex run.
See [Phase 5 worker setup and limits](docs/development/phase-5-local-codex-worker.md)
for profiles, sandbox modes, runner API and failure handling.

## Open the web app

With Node.js 24 and npm, build the static frontend once and start Zellige in
the same terminal:

```sh
npm --prefix web ci
npm --prefix web run build
export ZELLIGE_API_TOKEN='replace-with-a-long-random-value'
uv run zellige
```

Open `http://127.0.0.1:8787` and choose **Conectar servidor**. Enter the same
`ZELLIGE_API_TOKEN` in Settings; it authenticates this browser, not an AI
provider. Setting an environment variable in the server does not log the
browser in. The token and selected conversation/branch are kept only in the
tab's `sessionStorage`; the appearance preference uses `localStorage`.

- Start a conversation by saving its first message; reopen it from the sidebar.
- Search titles (Enter), rename, archive and restore conversations.
- Create branches from messages; editing creates a branch and preserves the original.
- Create execution profiles in Settings and queue runs against a saved history.
- Use the details panel for persisted runs, IDs, HTTP responses and manual outbox reads.

Codex-local execution is available through the separate `zellige-worker` process.
Create a **Codex local** profile, queue a run, and start a worker with the same API
token and an explicit workspace root. Run state remains canonical in the daemon;
use **Sincronizar cambios** in the details panel to pull worker transitions and
results. Automatic browser sync and account login are not implemented yet. A
concurrent append returns 409, refreshes history, keeps the draft, and never
retries silently. Archive is reversible organization, not deletion; archived
histories remain writable.

For frontend development with live reload, keep the backend running and use
`npm --prefix web run dev` in another terminal. Open `http://127.0.0.1:5173`;
Vite proxies the API and docs to port 8787. The production build needs no Node
process: the daemon serves `web/dist` beside the authenticated API. A separately
installed Python wheel is API-only unless started with `--web-dir /path/to/dist`.
Static hosting of the app elsewhere requires a same-origin proxy to a Zellige
daemon; it does not turn SQLite or the backend into a static website.

Web checks:

```sh
cd web
npm run lint
npm run typecheck
npm test
npm run build
```

`web/src/api/` owns HTTP contracts and bearer/error handling.
`web/src/features/useWorkspace.ts` is the single workspace composition facade;
focused state owners and explicit request workflows live in
`web/src/features/workspace/`, sharing one synchronous operation gate.
`web/src/app/` owns shell presentation, theme and naming prompts;
`web/src/components/` renders the sidebar, chat, settings and optional inspector
with explicit view/action props. Chat presentation lives in `components/chat/`.
`web/src/storage/session.ts` keeps the unchanged tab-scoped storage contract.
See [frontend Phase 1 ownership and behavior](docs/development/frontend-phase-1.md).
Styling uses Tailwind
through the Vite plugin. `web/src/components/ui/` contains shadcn/ui's Base UI
primitives (base-mira), with its MIT notice in `web/public/shadcn-LICENSE.txt`.

## Run with Docker Compose

```sh
export ZELLIGE_API_TOKEN='replace-with-a-long-random-value'
docker compose up --build -d
docker compose ps
```

The image builds and includes the web app; open `http://127.0.0.1:8787`.
Compose binds only to loopback and stores the database and blobs in the named
`zellige-data` volume. Put a private reverse proxy or VPN in front of the API for
remote-device access; do not expose the PoC directly to the public Internet.

The private pilot uses `compose.lab.yaml`. The public website and its deployment
live in [zellige-oss/landing](https://github.com/zellige-oss/landing).
`compose.tailscale.yaml` adds two isolated VPN ingress connectors for sharing;
see [`docs/deployment/lab.md`](docs/deployment/lab.md) for local secrets, proxy
routes, persistent storage and the Tailscale sharing boundary. Reusable brand
assets and their source prompts are documented in
[`docs/design/brand-assets.md`](docs/design/brand-assets.md).

## Test

```sh
uv run python -m unittest discover -s tests -v
```

The suite covers conversations, branches, concurrent HTTP writers, distinct run
profiles, versioned context packs, outbox cursor reconnection, cross-conversation
integrity, content-addressed artifacts, WAL, persistence after daemon restart,
v1-to-v2 migration, archived conversation management, metadata conflicts and
static serving without bypassing API authentication.

## Continuous integration

PRs to `main` and pushes to `main` run package/Docker builds, backend tests with
coverage, and web lint/types/tests/build, followed by SonarQube Cloud analysis
and its quality gate. Sonar
requires a free OSS project and repository variables/secrets before its check
can pass. Setup, required checks, and local commands are documented in
[`docs/development/ci.md`](docs/development/ci.md).

The public website is maintained independently in
[zellige-oss/landing](https://github.com/zellige-oss/landing).

## Scope

This is not yet a production server. It has no user/account model, rate limiting,
TLS termination, distributed runner scheduling/recovery, streaming upload, outbox
compaction, backup automation, or stable public API guarantee.

### Workspace URLs

The frontend uses clean pathname routes: `/` opens a new workspace (without
creating a server conversation), and `/chat/:conversationId` requests a concrete
conversation. The URL takes precedence over the saved conversation; a matching
saved branch can be restored on refresh. Settings, inspector and naming dialogs
remain overlays. Browser back/forward navigates conversations without replaying
writes; unavailable links recover with an accessible notice.

Direct-open/refresh requires the host to serve the SPA entry point at these
paths. Vite supports this. **The current production Starlette `StaticFiles`
mount does not provide arbitrary-path SPA fallback; production deep-link refresh
is not delivered by this phase.** Backend/deployment fallback is a deferred
prerequisite, not a frontend routing fix. See
[Frontend Phase 2](docs/development/frontend-phase-2.md) for ownership and checks.
