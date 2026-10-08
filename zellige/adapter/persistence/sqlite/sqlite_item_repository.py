from zellige.adapter.persistence.sqlite.change_data import item_data
from zellige.adapter.persistence.sqlite.codec import to_json
from zellige.adapter.persistence.sqlite.row_mapper import item_from_row
from zellige.adapter.persistence.sqlite.sqlite_repository import SQLiteRepository
from zellige.domain.model.item import Item


class SQLiteItemRepository(SQLiteRepository):
    def find_by_id(self, conversation_id: str, item_id: str) -> Item | None:
        row = self._fetch_one(
            "SELECT * FROM items WHERE id = ? AND conversation_id = ?",
            item_id,
            conversation_id,
        )
        return item_from_row(row) if row is not None else None

    def add(self, item: Item, artifact_links: list[tuple[str, str, int]]) -> None:
        i = item
        self.db.execute(
            """INSERT INTO items (id, conversation_id, parent_item_id, run_id, kind,
                                  payload_schema_version, payload_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                i.id,
                i.conversation_id,
                i.parent_item_id,
                i.run_id,
                i.kind,
                i.payload_schema_version,
                to_json(i.payload),
                i.created_at,
            ),
        )
        self.db.executemany(
            "INSERT INTO item_artifacts (item_id, artifact_id, role, ordinal) VALUES (?, ?, ?, ?)",
            [
                (i.id, artifact_id, role, ordinal)
                for artifact_id, role, ordinal in artifact_links
            ],
        )
        self._log("item", i.id, item_data(i), i.conversation_id)
