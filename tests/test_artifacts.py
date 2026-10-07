import concurrent.futures
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from zellige.adapter.persistence.sqlite.database import Database
from zellige.adapter.persistence.sqlite.sqlite_unit_of_work import (
    SQLiteUnitOfWork,
)
from zellige.adapter.storage.file_blob_store import FileBlobStore
from zellige.application.port.persistence.persistence_conflict import (
    PersistenceConflict,
)
from zellige.application.service.artifact_service import ArtifactService
from zellige.domain.model.artifact import Artifact


class ArtifactIdentityTests(unittest.TestCase):
    def test_identity_comes_from_the_bytes(self):
        artifact = Artifact.from_content(b"hello", "", 123)
        self.assertEqual(
            artifact.sha256,
            "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
        )
        self.assertEqual(artifact.id, f"artifact_sha256_{artifact.sha256}")
        self.assertEqual(artifact.storage_key, f"sha256/2c/{artifact.sha256[2:]}")
        self.assertEqual(
            (artifact.media_type, artifact.size_bytes, artifact.created_at),
            ("application/octet-stream", 5, 123),
        )


class ArtifactStorageTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        self.database = Database(
            root / "test.sqlite3", Path(__file__).resolve().parents[1] / "migrations"
        )
        self.blobs = FileBlobStore(root / "blobs")
        self.service = ArtifactService(
            SQLiteUnitOfWork(self.database, lambda: 123), self.blobs, lambda: 123
        )

    def count(self, table: str) -> int:
        with self.database.transaction() as connection:
            return connection.execute(f"SELECT count(*) FROM {table}").fetchone()[0]

    def test_concurrent_duplicate_uploads_publish_one_change(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            artifacts = list(
                pool.map(lambda _: self.service.put(b"same", "text/plain"), range(8))
            )
        self.assertTrue(all(artifact == artifacts[0] for artifact in artifacts))
        duplicate = self.service.put(b"same", "application/octet-stream")
        self.assertEqual(duplicate, artifacts[0])  # the first stored metadata wins
        self.assertEqual(
            (self.blobs.root / duplicate.storage_key).read_bytes(), b"same"
        )
        self.assertEqual((self.count("artifacts"), self.count("changes")), (1, 1))

    def test_blob_failure_persists_no_metadata(self):
        with (
            patch.object(self.blobs, "put", side_effect=OSError("disk full")),
            self.assertRaises(OSError),
        ):
            self.service.put(b"hello", "text/plain")
        self.assertEqual((self.count("artifacts"), self.count("changes")), (0, 0))

    def test_change_failure_rolls_back_metadata_and_retry_recovers(self):
        with self.database.transaction() as connection:
            connection.execute("""CREATE TRIGGER fail_change BEFORE INSERT ON changes
                                  BEGIN SELECT RAISE(ABORT, 'test failure'); END""")
        with self.assertRaises(PersistenceConflict):
            self.service.put(b"retry", "text/plain")
        self.assertEqual((self.count("artifacts"), self.count("changes")), (0, 0))
        with self.database.transaction() as connection:
            connection.execute("DROP TRIGGER fail_change")
        artifact = self.service.put(b"retry", "text/plain")
        self.assertEqual(
            (self.blobs.root / artifact.storage_key).read_bytes(), b"retry"
        )
        self.assertEqual(self.count("changes"), 1)

    def test_failed_publish_cleans_temporary_file(self):
        with (
            patch(
                "zellige.adapter.storage.file_blob_store.os.replace",
                side_effect=OSError("test failure"),
            ),
            self.assertRaises(OSError),
        ):
            self.service.put(b"hello", "text/plain")
        self.assertEqual(
            [path for path in self.blobs.root.rglob("*") if path.is_file()], []
        )


if __name__ == "__main__":
    unittest.main()
