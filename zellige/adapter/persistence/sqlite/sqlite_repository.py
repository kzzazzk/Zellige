import sqlite3
from typing import Any

from zellige.adapter.persistence.sqlite.codec import to_json
from zellige.application.port.clock import Clock
from zellige.domain.model.types import JsonObject


class SQLiteRepository:
    """Query helpers and change logging on the connection of one transaction."""

    def __init__(self, connection: sqlite3.Connection, clock: Clock) -> None:
        self.db = connection
        self.clock = clock

    def _fetch_one(self, sql: str, *args: Any) -> sqlite3.Row | None:
        row: sqlite3.Row | None = self.db.execute(sql, args).fetchone()
        return row

    def _fetch_all(self, sql: str, *args: Any) -> list[sqlite3.Row]:
        return self.db.execute(sql, args).fetchall()

    def _log(
        self,
        entity_type: str,
        entity_id: str,
        data: JsonObject,
        conversation_id: str | None = None,
    ) -> None:
        """Record an upsert in the change feed, inside the same transaction."""
        self.db.execute(
            """INSERT INTO changes(conversation_id, entity_type, entity_id, operation, data_json, changed_at)
               VALUES (?, ?, ?, 'upsert', ?, ?)""",
            (conversation_id, entity_type, entity_id, to_json(data), self.clock()),
        )
