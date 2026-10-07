-- Zellige canonical database schema, migration v1.
-- Application code enables foreign_keys, WAL and busy_timeout per connection.

CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
) STRICT;

CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
) STRICT;

CREATE TABLE runtime_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at INTEGER NOT NULL
) STRICT;

CREATE TABLE runtime_profile_versions (
    id TEXT PRIMARY KEY,
    runtime_profile_id TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    definition_json TEXT NOT NULL CHECK (json_valid(definition_json)),
    created_at INTEGER NOT NULL,
    UNIQUE (runtime_profile_id, version),
    FOREIGN KEY (runtime_profile_id) REFERENCES runtime_profiles(id)
) STRICT;

CREATE TABLE provider_sessions (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    harness TEXT NOT NULL,
    provider_instance_ref TEXT NOT NULL,
    native_session_ref TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'lost', 'closed')),
    created_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL,
    UNIQUE (provider, harness, provider_instance_ref, native_session_ref)
) STRICT;

CREATE TABLE context_packs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at INTEGER NOT NULL
) STRICT;

CREATE TABLE context_pack_versions (
    id TEXT PRIMARY KEY,
    context_pack_id TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    manifest_json TEXT NOT NULL CHECK (json_valid(manifest_json)),
    created_at INTEGER NOT NULL,
    UNIQUE (context_pack_id, version),
    FOREIGN KEY (context_pack_id) REFERENCES context_packs(id)
) STRICT;

CREATE TABLE branches (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    name TEXT NOT NULL,
    head_item_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (id, conversation_id),
    UNIQUE (conversation_id, name),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    FOREIGN KEY (head_item_id, conversation_id)
        REFERENCES items(id, conversation_id)
        DEFERRABLE INITIALLY DEFERRED
) STRICT;

CREATE TABLE runs (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    input_head_item_id TEXT,
    runtime_profile_version_id TEXT NOT NULL,
    provider_session_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    request_json TEXT NOT NULL CHECK (json_valid(request_json)),
    result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    completed_at INTEGER,
    UNIQUE (id, conversation_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    FOREIGN KEY (branch_id, conversation_id) REFERENCES branches(id, conversation_id),
    FOREIGN KEY (input_head_item_id, conversation_id)
        REFERENCES items(id, conversation_id)
        DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (runtime_profile_version_id) REFERENCES runtime_profile_versions(id),
    FOREIGN KEY (provider_session_id) REFERENCES provider_sessions(id)
) STRICT;

CREATE TABLE items (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    parent_item_id TEXT,
    run_id TEXT,
    kind TEXT NOT NULL CHECK (kind IN ('message', 'tool_call', 'tool_result', 'activity', 'artifact')),
    payload_schema_version INTEGER NOT NULL CHECK (payload_schema_version = 1),
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    created_at INTEGER NOT NULL,
    UNIQUE (id, conversation_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    FOREIGN KEY (parent_item_id, conversation_id) REFERENCES items(id, conversation_id),
    FOREIGN KEY (run_id, conversation_id) REFERENCES runs(id, conversation_id)
) STRICT;

CREATE TABLE run_context_packs (
    run_id TEXT NOT NULL,
    context_pack_version_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    PRIMARY KEY (run_id, context_pack_version_id),
    UNIQUE (run_id, ordinal),
    FOREIGN KEY (run_id) REFERENCES runs(id),
    FOREIGN KEY (context_pack_version_id) REFERENCES context_pack_versions(id)
) STRICT;

CREATE TABLE artifacts (
    id TEXT PRIMARY KEY,
    sha256 TEXT NOT NULL UNIQUE CHECK (length(sha256) = 64),
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
    media_type TEXT NOT NULL,
    storage_key TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
) STRICT;

CREATE TABLE item_artifacts (
    item_id TEXT NOT NULL,
    artifact_id TEXT NOT NULL,
    role TEXT NOT NULL,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    PRIMARY KEY (item_id, role, ordinal),
    FOREIGN KEY (item_id) REFERENCES items(id),
    FOREIGN KEY (artifact_id) REFERENCES artifacts(id)
) STRICT;

CREATE TABLE external_references (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    provider_instance_ref TEXT NOT NULL,
    kind TEXT NOT NULL,
    external_id TEXT NOT NULL,
    metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json)),
    created_at INTEGER NOT NULL,
    UNIQUE (provider, provider_instance_ref, kind, external_id)
) STRICT;

CREATE TABLE item_external_references (
    item_id TEXT NOT NULL,
    external_reference_id TEXT NOT NULL,
    role TEXT NOT NULL,
    PRIMARY KEY (item_id, external_reference_id, role),
    FOREIGN KEY (item_id) REFERENCES items(id),
    FOREIGN KEY (external_reference_id) REFERENCES external_references(id)
) STRICT;

CREATE TABLE changes (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
    data_json TEXT NOT NULL CHECK (json_valid(data_json)),
    changed_at INTEGER NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
) STRICT;

CREATE INDEX idx_items_conversation_parent ON items(conversation_id, parent_item_id);
CREATE INDEX idx_runs_conversation ON runs(conversation_id, started_at);
CREATE INDEX idx_changes_conversation_seq ON changes(conversation_id, seq);

-- Append-only records are protected at the database boundary.
CREATE TRIGGER items_no_update BEFORE UPDATE ON items
BEGIN SELECT RAISE(ABORT, 'items are immutable'); END;
CREATE TRIGGER items_no_delete BEFORE DELETE ON items
BEGIN SELECT RAISE(ABORT, 'items are immutable'); END;
CREATE TRIGGER profile_versions_no_update BEFORE UPDATE ON runtime_profile_versions
BEGIN SELECT RAISE(ABORT, 'runtime profile versions are immutable'); END;
CREATE TRIGGER profile_versions_no_delete BEFORE DELETE ON runtime_profile_versions
BEGIN SELECT RAISE(ABORT, 'runtime profile versions are immutable'); END;
CREATE TRIGGER context_versions_no_update BEFORE UPDATE ON context_pack_versions
BEGIN SELECT RAISE(ABORT, 'context pack versions are immutable'); END;
CREATE TRIGGER context_versions_no_delete BEFORE DELETE ON context_pack_versions
BEGIN SELECT RAISE(ABORT, 'context pack versions are immutable'); END;
CREATE TRIGGER artifacts_no_update BEFORE UPDATE ON artifacts
BEGIN SELECT RAISE(ABORT, 'artifacts are immutable'); END;
CREATE TRIGGER artifacts_no_delete BEFORE DELETE ON artifacts
BEGIN SELECT RAISE(ABORT, 'artifacts are immutable'); END;
CREATE TRIGGER changes_no_update BEFORE UPDATE ON changes
BEGIN SELECT RAISE(ABORT, 'changes are append-only'); END;
CREATE TRIGGER changes_no_delete BEFORE DELETE ON changes
BEGIN SELECT RAISE(ABORT, 'changes are append-only'); END;
