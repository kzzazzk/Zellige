# Zellige

Zellige is an open-source, self-hosted conversation service. It keeps one
provider-neutral conversation model while allowing different execution profiles
for general chat, coding, research, and durable personal agents.

This repository contains the server-side SQLite proof of concept and a small
technical web console. The server remains deliberately small: FastAPI, an
authenticated HTTP API, a single daemon-owned database, and content-addressed
artifact storage.

## What the PoC proves

- Canonical conversations with branches and immutable structured items.
- Atomic optimistic appends using `expected_head_item_id` and HTTP 409 conflicts.
- Runs tied to immutable runtime-profile and context-pack versions.
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

## Try the web console

Keep the backend running as above. In another terminal, with Node.js 24 and npm:

```sh
cd web
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. Vite forwards `/health` and `/v1` to the local
backend at `127.0.0.1:8787`; the browser never opens the SQLite file. Enter the
same `ZELLIGE_API_TOKEN` in the password field, create a conversation, add a
message, refresh its history, create a runtime profile and queued run, and read
the outbox manually. Existing conversations can be opened by conversation and
branch IDs. The console keeps the token, those IDs, and the change cursor in
this tab's `sessionStorage`, so a reload restores the server's canonical head.
Clear the token or close the tab when finished, especially on shared devices.

The console is not a hosted product UI: there is no login, conversation list,
runner, generated assistant reply, or automatic sync. A concurrent append
returns 409, refreshes history, keeps the draft, and never retries it silently.
The backend has no run-status read endpoint; the UI can show only the initial
`queued` result returned by `POST /v1/runs`.

Web checks:

```sh
cd web
npm run lint
npm run typecheck
npm test
npm run build
```

`web/src/api/` owns HTTP contracts and bearer/error handling;
`web/src/features/useConsole.ts` coordinates the visible flows;
`web/src/components/` renders the conversation and technical panels;
`web/src/storage/session.ts` owns tab-scoped restoration. Styling uses Tailwind
through the Vite plugin, without a separate CSS build process.

## Run with Docker Compose

```sh
export ZELLIGE_API_TOKEN='replace-with-a-long-random-value'
docker compose up --build -d
docker compose ps
```

Compose binds only to loopback and stores the database and blobs in the named
`zellige-data` volume. Put a private reverse proxy or VPN in front of the API for
remote-device access; do not expose the PoC directly to the public Internet.

## Test

```sh
uv run python -m unittest discover -s tests -v
```

The suite covers conversations, branches, concurrent HTTP writers, distinct run
profiles, versioned context packs, outbox cursor reconnection, cross-conversation
integrity, content-addressed artifacts, WAL, and persistence after daemon restart.

## Continuous integration

PRs to `main` and pushes to `main` run package/Docker builds, backend tests with
coverage, and web lint/types/tests/build, followed by SonarQube Cloud analysis
and its quality gate. Sonar
requires a free OSS project and repository variables/secrets before its check
can pass. Setup, required checks, and local commands are documented in
[`docs/development/ci.md`](docs/development/ci.md).

The static frontend is hosted on Vercel through its native GitHub integration.
Vercel Deployment Checks require all four CI checks before production is
promoted to `zellige.dev`; Cloudflare is registrar/DNS only. See
[deployment setup and operations](docs/development/deployment.md).
The hosted console has no backend: do not enter real API tokens.
Backend deployment and release publishing remain disabled.

## Scope

This is not yet a production server. It has no user/account model, rate limiting,
TLS termination, runner integration, streaming upload, outbox compaction, backup
automation, or stable public API guarantee.
