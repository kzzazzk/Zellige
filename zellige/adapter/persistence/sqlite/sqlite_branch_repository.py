from zellige.adapter.persistence.sqlite.change_data import branch_data
from zellige.adapter.persistence.sqlite.row_mapper import branch_from_row
from zellige.adapter.persistence.sqlite.sqlite_repository import SQLiteRepository
from zellige.domain.model.branch import Branch


class SQLiteBranchRepository(SQLiteRepository):
    def find_by_id(self, conversation_id: str, branch_id: str) -> Branch | None:
        row = self._fetch_one(
            "SELECT * FROM branches WHERE id = ? AND conversation_id = ?",
            branch_id,
            conversation_id,
        )
        return branch_from_row(row) if row is not None else None

    def find_all(self, conversation_id: str) -> list[Branch]:
        rows = self._fetch_all(
            "SELECT * FROM branches WHERE conversation_id = ? ORDER BY created_at, id",
            conversation_id,
        )
        return [branch_from_row(row) for row in rows]

    def add(self, branch: Branch) -> None:
        b = branch
        self.db.execute(
            "INSERT INTO branches (id, conversation_id, name, head_item_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (
                b.id,
                b.conversation_id,
                b.name,
                b.head_item_id,
                b.created_at,
                b.updated_at,
            ),
        )
        self._log("branch", b.id, branch_data(b), b.conversation_id)

    def move_head(self, branch: Branch, expected_head: str | None) -> bool:
        b = branch
        moved = (
            self.db.execute(
                """UPDATE branches SET head_item_id = ?, updated_at = ?
               WHERE id = ? AND conversation_id = ? AND head_item_id IS ?""",
                (b.head_item_id, b.updated_at, b.id, b.conversation_id, expected_head),
            ).rowcount
            == 1
        )
        if moved:
            self._log("branch", b.id, branch_data(b), b.conversation_id)
        return moved
