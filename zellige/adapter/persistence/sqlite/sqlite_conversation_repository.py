from zellige.adapter.persistence.sqlite.change_data import conversation_data
from zellige.adapter.persistence.sqlite.row_mapper import conversation_from_row
from zellige.adapter.persistence.sqlite.sqlite_repository import SQLiteRepository
from zellige.domain.model.conversation import Conversation


class SQLiteConversationRepository(SQLiteRepository):
    def find_by_id(
        self, conversation_id: str, *, include_deleted: bool = False
    ) -> Conversation | None:
        deleted = "" if include_deleted else " AND deleted_at IS NULL"
        row = self._fetch_one(
            f"SELECT * FROM conversations WHERE id = ?{deleted}", conversation_id
        )
        return conversation_from_row(row) if row is not None else None

    def find_all(
        self, archived: bool, query: str, limit: int, offset: int
    ) -> list[Conversation]:
        rows = self._fetch_all(
            """SELECT * FROM conversations
               WHERE deleted_at IS NULL AND (archived_at IS NOT NULL) = ?
                 AND instr(lower(title), lower(?)) > 0
               ORDER BY updated_at DESC, id ASC LIMIT ? OFFSET ?""",
            archived,
            query,
            limit,
            offset,
        )
        return [conversation_from_row(row) for row in rows]

    def add(self, conversation: Conversation) -> None:
        c = conversation
        self.db.execute(
            "INSERT INTO conversations (id, title, created_at, updated_at, deleted_at, archived_at) VALUES (?, ?, ?, ?, ?, ?)",
            (c.id, c.title, c.created_at, c.updated_at, c.deleted_at, c.archived_at),
        )
        self._log("conversation", c.id, conversation_data(c), c.id)

    def save(self, conversation: Conversation) -> None:
        c = conversation
        self.db.execute(
            "UPDATE conversations SET title = ?, archived_at = ?, updated_at = ? WHERE id = ?",
            (c.title, c.archived_at, c.updated_at, c.id),
        )
        self._log("conversation", c.id, conversation_data(c), c.id)
