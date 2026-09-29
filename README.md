# Zellige

Zellige is an open-source, self-hosted conversation service. It keeps one
provider-neutral conversation model while allowing different execution profiles
for general chat, coding, research, and durable personal agents.

This repository currently contains the server-side SQLite proof of concept. It
is deliberately small: FastAPI, an authenticated HTTP API, a single
daemon-owned database, and content-addressed artifact storage.

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

PRs to `main` and pushes to `main` run package/Docker builds and tests with
coverage, followed by SonarQube Cloud analysis and its quality gate. Sonar
requires a free OSS project and repository variables/secrets before its check
can pass. Setup, required checks, and local commands are documented in
[`docs/development/ci.md`](docs/development/ci.md).

Release publishing and automatic deployment are not enabled yet.

## Scope

This is not yet a production server. It has no user/account model, rate limiting,
TLS termination, runner integration, streaming upload, outbox compaction, backup
automation, or stable public API guarantee.
