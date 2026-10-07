# Canonical conversation database

Status: proof of concept, migrations 001 (canonical history) and 002 (archive).

## Boundary and ownership

SQLite exists only on the server. The Zellige daemon is the only process that
opens the database file; clients use its authenticated HTTP API. The daemon
enables WAL, foreign keys, and a 5-second busy timeout on every connection.
Writes use short transactions, and branch appends start with `BEGIN IMMEDIATE`.

Secrets do not belong in this database. In particular, `provider_sessions`
stores opaque routing and native-session references, not API keys, OAuth tokens,
cookies, or harness credentials. The provider or harness remains responsible
for its own authentication.

## Conversation shape

The canonical model is a rooted tree with named branch heads:

- Every immutable `item` has zero or one parent.
- A `branch` points at its current `head_item_id`.
- History is reconstructed by following parents from a branch head.
- A new branch can start at any item in the same conversation.

Although the product calls this a conversation graph, v1 is not a general DAG:
an item cannot have two structural parents. A future merge must either create a
normal child that records the merged source as an `external_reference`, or add a
separate edge relation in a later migration. The v1 schema must not overload
`parent_item_id` with provider-specific merge semantics.

Composite foreign keys guarantee that item parents, branch heads, runs, and
branches cannot cross conversation boundaries. The database also blocks update
or deletion of items and other versioned records.

The web app edits a message by creating a branch at that message's parent and
appending a replacement there. It never updates or deletes an existing item;
the original branch and its descendants remain intact. Branch creation and the
replacement append are separate transactions in this MVP. If the append fails,
the new branch can exist without the replacement; the UI preserves the edit.

Migration 002 adds nullable `conversations.archived_at`. Archiving is reversible
organization, distinct from `deleted_at`, and does not prevent appends. Lists
exclude deleted records and filter active/archived conversations explicitly.
Rename/archive/restore use `expected_updated_at` as an optimistic metadata
version; stale writes return 409. Every successful metadata update advances it
and writes a full conversation into the same transactional outbox.

Conversation lists use bounded offset pagination (default 50, maximum 200).
Concurrent updates can reorder pages; clients de-duplicate IDs and refresh from
the first page. This is navigation, not a replacement for the `changes` cursor.
The UI pulls changes manually; automatic multi-device sync is not implemented.

## Runs and portable execution

`runtime_profiles` are stable identities. Each execution points to an immutable
`runtime_profile_version`, so changing the definition of “general”, “code”, or
another profile cannot rewrite history. A run captures `input_head_item_id`
when queued, rather than deriving its input later from a branch head that may
have moved. `created_at`, `started_at`, and `completed_at` remain distinct; a
queued run has not started.

Context packs were removed from the application on 2026-10-06: harnesses
manage their own context, and user memory will be designed with the personal
agent. Their tables (`context_packs`, `context_pack_versions`,
`run_context_packs`) remain in migration 001 but no code reads or writes them.

A `provider_session` is optional. Losing it can prevent native resumption but
must not remove the canonical conversation, items, run request, selected profile
version, or artifacts. Provider switching during an active run
is outside the v1 PoC and should be rejected by the future runner layer.

## Item payload contract

`items.payload_json` is governed by
[`db/schemas/item-payload.schema.json`](../../db/schemas/item-payload.schema.json),
JSON Schema 2020-12, version 1. The envelope has a `type` discriminator equal to
the relational `items.kind`. The Pydantic models in
`zellige/domain/model/payload.py` are the source of truth for request validation,
the OpenAPI components, and the standalone JSON Schema. A test regenerates the
latter and rejects drift.
Supported kinds are:

- `message`: role plus ordered text/artifact content blocks.
- `tool_call`: stable call ID, tool name, and object arguments.
- `tool_result`: matching call ID, status, ordered content, and optional error.
- `activity`: named lifecycle/progress event with structured details.
- `artifact`: reference to content-addressed data plus portable metadata.

SQLite verifies that stored payloads are valid JSON. The daemon performs the
version-specific structural validation before insertion. Unknown fields are
rejected in v1 so producers must increment the schema version for incompatible
changes.

## Optimistic writes

Appending an item requires `expected_head_item_id`, including explicit `null`
for an empty branch. In one transaction the daemon:

1. Reads and compares the branch head.
2. Inserts the immutable item with that head as its parent.
3. Advances the branch only if the head still has the expected value.
4. Appends complete item, branch, and conversation records to `changes`.

A stale writer receives HTTP 409 with the actual head and can reload, branch, or
retry deliberately. It is never silently rebased.

## Incremental synchronization

`changes.seq` is the server-wide monotonic cursor. Canonical writes and their
change rows commit in the same transaction. `GET /v1/changes?cursor=N` returns
rows strictly after `N`, ordered by sequence, plus `next_cursor` and `has_more`.
An `upsert` row always carries a complete canonical object, not a partial patch.

The PoC retains changes indefinitely. Before adding pruning, the protocol needs
a server generation and minimum retained cursor so an outdated client can be
told to perform a full snapshot. Deletes will use explicit `delete` change rows;
hard deletion is not part of v1.

## Artifacts

Artifact bytes live outside SQLite under `blobs/sha256/<prefix>/<suffix>`.
SQLite stores the SHA-256 digest, byte size, media type, and relative storage
key. Paths are server-relative and never expose client filesystem locations.
The initial upload endpoint is intentionally bounded to 100 MiB; streaming and
garbage collection are future work.

External references include a non-secret provider-instance reference in their
identity. This avoids collisions when two self-hosted instances of the same
provider use the same external ID.

## Migration policy

Numbered SQL files in `db/migrations/` are append-only after release. The daemon
records applied versions in `schema_migrations`. During this PoC, migration 001
may still be revised because no production database has been declared. Once v1
is released, corrections must use a new numbered migration.
