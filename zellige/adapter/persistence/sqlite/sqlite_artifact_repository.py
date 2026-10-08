from zellige.adapter.persistence.sqlite.change_data import artifact_data
from zellige.adapter.persistence.sqlite.row_mapper import artifact_from_row
from zellige.adapter.persistence.sqlite.sqlite_repository import SQLiteRepository
from zellige.domain.model.artifact import Artifact


class SQLiteArtifactRepository(SQLiteRepository):
    def save_if_absent(self, artifact: Artifact) -> Artifact:
        a = artifact
        inserted = self.db.execute(
            """INSERT OR IGNORE INTO artifacts (id, sha256, size_bytes, media_type, storage_key, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (a.id, a.sha256, a.size_bytes, a.media_type, a.storage_key, a.created_at),
        ).rowcount
        row = self._fetch_one("SELECT * FROM artifacts WHERE sha256 = ?", a.sha256)
        assert row is not None
        stored = artifact_from_row(row)
        if inserted:
            self._log("artifact", stored.id, artifact_data(stored))
        return stored
