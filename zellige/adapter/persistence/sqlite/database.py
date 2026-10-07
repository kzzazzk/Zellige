import contextlib
import sqlite3
import time
from collections.abc import Iterator
from pathlib import Path


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
                    row[0]
                    for row in connection.execute(
                        "SELECT version FROM schema_migrations"
                    )
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
                    f"VALUES ({version}, {time.time_ns() // 1_000});\nCOMMIT;"
                )
        finally:
            connection.close()

    def quick_check(self) -> str:
        with contextlib.closing(self.connect()) as connection:
            return str(connection.execute("PRAGMA quick_check").fetchone()[0])
