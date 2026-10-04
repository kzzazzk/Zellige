"""SQLite implementation of the Store port.

All SQL lives here. Every write also appends to the `changes` log in the same
transaction, which is what clients synchronise from.
"""
import contextlib
import json
import sqlite3
import time
from collections.abc import Iterator
from dataclasses import asdict
from pathlib import Path
from typing import Any

from zellige.domain.artifacts import Artifact
from zellige.domain.errors import PersistenceConflict
from zellige.domain.models import Branch, Conversation, Item, Record, Run


def now_us() -> int:
    return time.time_ns() // 1_000


class Database:
    def __init__(self, path: Path, migrations_dir: Path, busy_timeout_ms: int = 5_000):
        self.path = path
        self.migrations_dir = migrations_dir
        self.busy_timeout_ms = busy_timeout_ms
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.migrate()

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(
            self.path,
            timeout=self.busy_timeout_ms / 1_000,
            isolation_level=None,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute(f"PRAGMA busy_timeout = {self.busy_timeout_ms}")
        connection.execute("PRAGMA journal_mode = WAL")
        return connection

    @contextlib.contextmanager
    def transaction(self, *, immediate: bool = False) -> Iterator[sqlite3.Connection]:
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE" if immediate else "BEGIN")
            yield connection
            connection.execute("COMMIT")
        except BaseException:
            if connection.in_transaction:
                connection.execute("ROLLBACK")
            raise
        finally:
            connection.close()

    def migrate(self) -> None:
        connection = self.connect()
        try:
            exists = connection.execute(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'"
            ).fetchone()
            applied = set()
            if exists:
                applied = {
                    row[0] for row in connection.execute("SELECT version FROM schema_migrations")
                }

            for path in sorted(self.migrations_dir.glob("[0-9][0-9][0-9]_*.sql")):
                version = int(path.name.split("_", 1)[0])
                if version in applied:
                    continue
                script = path.read_text(encoding="utf-8")
                connection.executescript(
                    "BEGIN IMMEDIATE;\n"
                    + script
                    + f"\nINSERT INTO schema_migrations(version, applied_at) "
                    f"VALUES ({version}, {now_us()});\nCOMMIT;"
                )
        finally:
            connection.close()

    def quick_check(self) -> str:
        with contextlib.closing(self.connect()) as connection:
            return str(connection.execute("PRAGMA quick_check").fetchone()[0])


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _record(row: sqlite3.Row | None) -> Any:
    """A row as a plain dict, decoding `*_json` columns into their bare names."""
    if row is None:
        return None
    result = dict(row)
    for key in tuple(result):
        if key.endswith("_json"):
            value = result.pop(key)
            result[key.removesuffix("_json")] = json.loads(value) if value is not None else None
    return result


class SQLiteSession:
    def __init__(self, connection: sqlite3.Connection):
        self.db = connection

    def _one(self, sql: str, *args: Any) -> Any:
        return _record(self.db.execute(sql, args).fetchone())

    def _all(self, sql: str, *args: Any) -> list[Any]:
        return [_record(row) for row in self.db.execute(sql, args)]

    def _log(self, entity_type: str, data: Record, conversation_id: str | None = None) -> None:
        self.db.execute(
            """INSERT INTO changes(conversation_id, entity_type, entity_id, operation, data_json, changed_at)
               VALUES (?, ?, ?, 'upsert', ?, ?)""",
            (conversation_id, entity_type, data["id"], _json(data), now_us()),
        )

    # --- Reads ------------------------------------------------------------------
    def conversation(self, conversation_id: str, *, include_deleted: bool = False) -> Conversation | None:
        deleted = "" if include_deleted else " AND deleted_at IS NULL"
        return self._one(f"SELECT * FROM conversations WHERE id = ?{deleted}", conversation_id)

    def conversations(self, archived: bool, query: str, limit: int, offset: int) -> list[Conversation]:
        return self._all(
            """SELECT * FROM conversations
               WHERE deleted_at IS NULL AND (archived_at IS NOT NULL) = ?
                 AND instr(lower(title), lower(?)) > 0
               ORDER BY updated_at DESC, id ASC LIMIT ? OFFSET ?""",
            archived, query, limit, offset,
        )

    def branch(self, conversation_id: str, branch_id: str) -> Branch | None:
        return self._one("SELECT * FROM branches WHERE id = ? AND conversation_id = ?", branch_id, conversation_id)

    def branches(self, conversation_id: str) -> list[Branch]:
        return self._all("SELECT * FROM branches WHERE conversation_id = ? ORDER BY created_at, id", conversation_id)

    def item(self, conversation_id: str, item_id: str) -> Item | None:
        return self._one("SELECT * FROM items WHERE id = ? AND conversation_id = ?", item_id, conversation_id)

    def run(self, conversation_id: str, run_id: str) -> Run | None:
        run = self._one("SELECT * FROM runs WHERE id = ? AND conversation_id = ?", run_id, conversation_id)
        return self._with_contexts(run) if run else None

    def runs(self, conversation_id: str, limit: int) -> list[Run]:
        rows = self._all(
            "SELECT * FROM runs WHERE conversation_id = ? ORDER BY created_at DESC, id LIMIT ?", conversation_id, limit
        )
        return [self._with_contexts(run) for run in rows]

    def _with_contexts(self, run: Record) -> Run:
        run["context_pack_version_ids"] = [row[0] for row in self.db.execute(
            "SELECT context_pack_version_id FROM run_context_packs WHERE run_id = ? ORDER BY ordinal", (run["id"],)
        )]
        return run  # type: ignore[return-value]

    def profiles(self) -> list[Record]:
        return [
            {"runtime_profile": profile, "version": self._one(
                "SELECT * FROM runtime_profile_versions WHERE runtime_profile_id = ? ORDER BY version DESC LIMIT 1",
                profile["id"],
            )}
            for profile in self._all("SELECT * FROM runtime_profiles ORDER BY name, id")
        ]

    def latest_context_version(self, context_pack_id: str) -> int:
        return self.db.execute(
            "SELECT COALESCE(MAX(version), 0) FROM context_pack_versions WHERE context_pack_id = ?", (context_pack_id,)
        ).fetchone()[0]

    def changes(self, cursor: int, limit: int) -> list[Record]:
        return self._all("SELECT * FROM changes WHERE seq > ? ORDER BY seq LIMIT ?", cursor, limit)

    # --- Writes -----------------------------------------------------------------
    def add_conversation(self, conversation: Conversation) -> None:
        c = conversation
        self.db.execute(
            "INSERT INTO conversations (id, title, created_at, updated_at, deleted_at, archived_at) VALUES (?, ?, ?, ?, ?, ?)",
            (c["id"], c["title"], c["created_at"], c["updated_at"], c["deleted_at"], c["archived_at"]),
        )
        self._log("conversation", c, c["id"])

    def save_conversation(self, conversation: Conversation) -> None:
        c = conversation
        self.db.execute(
            "UPDATE conversations SET title = ?, archived_at = ?, updated_at = ? WHERE id = ?",
            (c["title"], c["archived_at"], c["updated_at"], c["id"]),
        )
        self._log("conversation", c, c["id"])

    def add_branch(self, branch: Branch) -> None:
        b = branch
        self.db.execute(
            "INSERT INTO branches (id, conversation_id, name, head_item_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (b["id"], b["conversation_id"], b["name"], b["head_item_id"], b["created_at"], b["updated_at"]),
        )
        self._log("branch", b, b["conversation_id"])

    def move_head(self, branch: Branch, expected_head: str | None) -> bool:
        b = branch
        moved = self.db.execute(
            """UPDATE branches SET head_item_id = ?, updated_at = ?
               WHERE id = ? AND conversation_id = ? AND head_item_id IS ?""",
            (b["head_item_id"], b["updated_at"], b["id"], b["conversation_id"], expected_head),
        ).rowcount == 1
        if moved:
            self._log("branch", b, b["conversation_id"])
        return moved

    def add_item(self, item: Item, artifact_links: list[tuple[str, str, int]]) -> None:
        i = item
        self.db.execute(
            """INSERT INTO items (id, conversation_id, parent_item_id, run_id, kind,
                                  payload_schema_version, payload_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (i["id"], i["conversation_id"], i["parent_item_id"], i["run_id"], i["kind"],
             i["payload_schema_version"], _json(i["payload"]), i["created_at"]),
        )
        self.db.executemany(
            "INSERT INTO item_artifacts (item_id, artifact_id, role, ordinal) VALUES (?, ?, ?, ?)",
            [(i["id"], artifact_id, role, ordinal) for artifact_id, role, ordinal in artifact_links],
        )
        self._log("item", i, i["conversation_id"])

    def add_profile(self, profile: Record, version: Record) -> None:
        self.db.execute("INSERT INTO runtime_profiles VALUES (?, ?, ?, ?)",
                        (profile["id"], profile["name"], profile["description"], profile["created_at"]))
        self.db.execute("INSERT INTO runtime_profile_versions VALUES (?, ?, ?, ?, ?)",
                        (version["id"], profile["id"], version["version"], _json(version["definition"]), version["created_at"]))
        self._log("runtime_profile", profile)
        self._log("runtime_profile_version", version)

    def add_context_pack(self, pack: Record, version: Record) -> None:
        self.db.execute("INSERT INTO context_packs VALUES (?, ?, ?, ?)",
                        (pack["id"], pack["name"], pack["description"], pack["created_at"]))
        self._log("context_pack", pack)
        self.add_context_version(version)

    def add_context_version(self, version: Record) -> None:
        self.db.execute("INSERT INTO context_pack_versions VALUES (?, ?, ?, ?, ?)",
                        (version["id"], version["context_pack_id"], version["version"],
                         _json(version["manifest"]), version["created_at"]))
        self._log("context_pack_version", version)

    def add_run(self, run: Run) -> None:
        r = run
        self.db.execute(
            """INSERT INTO runs (id, conversation_id, branch_id, input_head_item_id, runtime_profile_version_id,
                                 provider_session_id, status, request_json, result_json,
                                 created_at, started_at, completed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL)""",
            (r["id"], r["conversation_id"], r["branch_id"], r["input_head_item_id"], r["runtime_profile_version_id"],
             r["provider_session_id"], r["status"], _json(r["request"]), r["created_at"]),
        )
        self.db.executemany(
            "INSERT INTO run_context_packs (run_id, context_pack_version_id, ordinal) VALUES (?, ?, ?)",
            [(r["id"], version_id, ordinal) for ordinal, version_id in enumerate(r["context_pack_version_ids"])],
        )
        self._log("run", r, r["conversation_id"])

    def save_artifact_if_absent(self, artifact: Artifact) -> Artifact:
        a = artifact
        inserted = self.db.execute(
            """INSERT OR IGNORE INTO artifacts (id, sha256, size_bytes, media_type, storage_key, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (a.id, a.sha256, a.size_bytes, a.media_type, a.storage_key, a.created_at),
        ).rowcount
        stored = Artifact(**self._one("SELECT * FROM artifacts WHERE sha256 = ?", a.sha256))
        if inserted:
            self._log("artifact", asdict(stored))
        return stored


class SQLiteStore:
    def __init__(self, database: Database):
        self.database = database

    @contextlib.contextmanager
    def read(self) -> Iterator[SQLiteSession]:
        with contextlib.closing(self.database.connect()) as connection:
            yield SQLiteSession(connection)

    @contextlib.contextmanager
    def write(self) -> Iterator[SQLiteSession]:
        try:
            with self.database.transaction(immediate=True) as connection:
                yield SQLiteSession(connection)
        except sqlite3.IntegrityError as error:
            raise PersistenceConflict(str(error)) from error

    def check(self) -> str:
        return self.database.quick_check()
