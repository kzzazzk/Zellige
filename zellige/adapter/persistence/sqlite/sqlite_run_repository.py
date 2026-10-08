from zellige.adapter.persistence.sqlite.change_data import run_data
from zellige.adapter.persistence.sqlite.codec import to_json
from zellige.adapter.persistence.sqlite.row_mapper import run_from_row
from zellige.adapter.persistence.sqlite.sqlite_repository import SQLiteRepository
from zellige.domain.model.run import Run


class SQLiteRunRepository(SQLiteRepository):
    def find_by_id(self, conversation_id: str, run_id: str) -> Run | None:
        row = self._fetch_one(
            "SELECT * FROM runs WHERE id = ? AND conversation_id = ?",
            run_id,
            conversation_id,
        )
        return run_from_row(row) if row is not None else None

    def find_all(self, conversation_id: str, limit: int, offset: int) -> list[Run]:
        rows = self._fetch_all(
            "SELECT * FROM runs WHERE conversation_id = ? ORDER BY created_at DESC, id LIMIT ? OFFSET ?",
            conversation_id,
            limit,
            offset,
        )
        return [run_from_row(row) for row in rows]

    def add(self, run: Run) -> None:
        r = run
        self.db.execute(
            """INSERT INTO runs (id, conversation_id, branch_id, input_head_item_id, runtime_profile_version_id,
                                 provider_session_id, status, request_json, result_json,
                                 created_at, started_at, completed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL)""",
            (
                r.id,
                r.conversation_id,
                r.branch_id,
                r.input_head_item_id,
                r.runtime_profile_version_id,
                r.provider_session_id,
                r.status,
                to_json(r.request),
                r.created_at,
            ),
        )
        self._log("run", r.id, run_data(r), r.conversation_id)
