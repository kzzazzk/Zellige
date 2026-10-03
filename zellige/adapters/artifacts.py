import json
import os
import uuid
from dataclasses import asdict
from pathlib import Path

from zellige.database import Database, now_us
from zellige.domain.artifacts import Artifact


class FileBlobStore:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def put(self, storage_key: str, content: bytes) -> None:
        target = self.root / storage_key
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            return
        temporary = target.with_name(f".{target.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp")
        try:
            temporary.write_bytes(content)
            os.replace(temporary, target)
        finally:
            temporary.unlink(missing_ok=True)


class SQLiteArtifactRepository:
    def __init__(self, database: Database):
        self.database = database

    def save_if_absent(self, artifact: Artifact) -> Artifact:
        with self.database.transaction(immediate=True) as connection:
            inserted = connection.execute(
                """INSERT OR IGNORE INTO artifacts
                   (id, sha256, size_bytes, media_type, storage_key, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (artifact.id, artifact.sha256, artifact.size_bytes,
                 artifact.media_type, artifact.storage_key, artifact.created_at),
            ).rowcount
            row = connection.execute(
                "SELECT * FROM artifacts WHERE sha256 = ?", (artifact.sha256,)
            ).fetchone()
            assert row is not None
            stored = Artifact(**dict(row))
            if inserted:
                connection.execute(
                    """INSERT INTO changes
                       (conversation_id, entity_type, entity_id, operation, data_json, changed_at)
                       VALUES (NULL, 'artifact', ?, 'upsert', ?, ?)""",
                    (stored.id, json.dumps(asdict(stored), ensure_ascii=False,
                                           separators=(",", ":"), sort_keys=True), now_us()),
                )
        return stored
