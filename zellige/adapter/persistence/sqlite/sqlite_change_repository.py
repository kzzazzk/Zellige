from zellige.adapter.persistence.sqlite.row_mapper import change_from_row
from zellige.adapter.persistence.sqlite.sqlite_repository import SQLiteRepository
from zellige.application.port.persistence.change_repository import Change


class SQLiteChangeRepository(SQLiteRepository):
    def find_after(self, cursor: int, limit: int) -> list[Change]:
        rows = self._fetch_all(
            "SELECT * FROM changes WHERE seq > ? ORDER BY seq LIMIT ?",
            cursor,
            limit,
        )
        return [change_from_row(row) for row in rows]
