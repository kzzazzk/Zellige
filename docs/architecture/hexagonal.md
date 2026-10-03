# Incremental hexagonal backend refactor

The first migrated use case is `POST /v1/artifacts`. Its HTTP contract, SHA-256
identity, storage layout, SQLite schema and changes cursor remain unchanged.

## Responsibilities

| File | Responsibility |
| --- | --- |
| `zellige/domain/artifacts.py` | Immutable artifact metadata, without infrastructure dependencies. |
| `zellige/application/artifacts.py` | Store-artifact use case: derive identity, persist bytes, register metadata. |
| `zellige/application/ports.py` | Blob storage, artifact repository and clock contracts. |
| `zellige/adapters/artifacts.py` | Filesystem and SQLite implementations. |
| `zellige/bootstrap.py` | Wire the artifact use case to production adapters. |
| `zellige/server.py` | FastAPI transport, authorization, request limits and daemon startup. |
| `zellige/service.py` | Existing service facade; delegates artifact writes to the new use case. |

Domain and application code must not import FastAPI, SQLite, filesystem adapters
or the legacy service. Dependencies point from adapters towards the application
ports and domain. HTTP-specific request validation remains at the API boundary.
The existing service constructor remains compatible with direct callers.

## Persistence guarantees

Blob publication precedes metadata registration. SQLite commits new metadata and
its change event in one `BEGIN IMMEDIATE` transaction. Repeated or concurrent
uploads return the first stored metadata and emit only one event. Failed blob
publication leaves no metadata or temporary file.

As before, the filesystem and SQLite are not one transaction: a database failure
can leave an unreferenced blob. Retrying the same bytes safely completes the
operation. This change does not introduce blob garbage collection.

## Next slices

Conversations, branches/items, runtime profiles, context packs and runs still use
the legacy service. Extract them by use case, preserving transaction boundaries
and existing API tests. In particular, append-item must keep head comparison,
item insertion, branch advancement and change events atomic; do not split those
steps across independently committing repositories.

Once those slices migrate, remove the legacy facade and separate the HTTP adapter
from CLI startup. Avoid a generic repository that exposes SQL connections to the
application layer.

## Verification

Run `uv run python -m unittest discover -s tests -v`. Artifact tests cover the use
case with memory ports, concurrent deduplication, metadata/event rollback and
cleanup after failed filesystem publication. Existing API tests exercise the
production wiring and linking artifacts into conversation history.
