# Backend architecture: pragmatic hexagonal

The daemon is a small core with two edges. Clients (the web pilot and any future
frontend) reach it through HTTP; the core reaches storage through one port.
The goal is clarity with little ceremony: most operations are CRUD and stay one
or two lines; only the operations with real rules get more.

```
HTTP (FastAPI)  ──▶  Zellige (application)  ──▶  Store port  ◀──  SQLite adapter
  server.py            application/zellige.py      ports.py        adapters/sqlite.py
                              │
                              ▼
                       domain rules (pure functions)
```

## Files

| File | Responsibility |
| --- | --- |
| `zellige/domain/conversations.py` | Pure rules: head check, conversation revision, version bump, artifact links, ancestry walk. |
| `zellige/domain/payloads.py` | Item payload validation against the canonical schema. |
| `zellige/domain/artifacts.py` | Content addressing: identity and storage key from the bytes. |
| `zellige/domain/models.py`, `errors.py` | Records exchanged with the store; `DomainError` (kind + code, no HTTP status). |
| `zellige/application/zellige.py` | `Zellige`: every operation a client can perform. The single entry point for all adapters. |
| `zellige/application/ports.py` | `Store` (read/write sessions) and `BlobStore`: the only two ports. |
| `zellige/adapters/sqlite.py` | All SQL, migrations and transactions; writes the `changes` log on every write. |
| `zellige/adapters/files.py` | Artifact bytes as files under `blobs/`, named by hash. |
| `zellige/server.py` | HTTP adapter: routes (auth applied once to all of `/v1`), body limits, `DomainError` kind → status; composition root (`build_app`). |

## Rules of thumb

- **One persistence port.** The core opens `store.read()` or `store.write()` and asks
  the session for exactly what it needs. No repository per table, no unit-of-work
  factory. A write session is one `BEGIN IMMEDIATE` transaction; constraint failures
  surface as `PersistenceConflict`, which the core turns into a domain conflict.
- **The change log is the adapter's job.** Every session write records its change in
  the same transaction, so use cases cannot forget to publish one.
- **CRUD stays thin.** Listing or creating a profile, context pack, branch or
  conversation is a direct session call. Logic lives in `append_item` (head check,
  run membership, artifact links, atomic head move), `update_conversation`
  (optimistic concurrency, archiving), `create_run` (pins the input head),
  `history` (ancestry with cycle detection) and `put_artifact` (bytes before metadata).
- **No transport in the core.** The core raises `DomainError("conflict" | "invalid" |
  "not_found" | "internal", code, message)`; only `server.py` knows those are 409, 400,
  404 and 500. Error codes and the HTTP contract are unchanged.
- **Dependencies point inwards.** Domain and application import neither FastAPI, SQLite
  nor adapters. One accepted exception: payload validation reuses the pydantic
  `ItemPayload` model from `api_models.py`, so the item schema has a single definition.

## Adding a frontend

Every frontend uses the same HTTP API (OpenAPI at `/openapi.json`) and syncs from
`GET /v1/changes`. A new adapter, such as a CLI or an MCP server, calls `Zellige`
directly, with no HTTP in between.

## Guarantees kept from before

Append-item keeps head comparison, item insertion, branch advancement and the
change events in one transaction. Blob publication precedes artifact metadata;
a database failure can leave an unreferenced blob, and retrying the same bytes
completes the operation (no blob garbage collection yet).

## Verification

`uv run python -m unittest discover -s tests -v`: `test_domain` covers the rules
without storage, `test_artifacts` artifact identity, deduplication and rollback, and
`test_service` the whole API through the production wiring.
