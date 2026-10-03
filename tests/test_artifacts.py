import concurrent.futures
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from zellige.adapters.artifacts import FileBlobStore, SQLiteArtifactRepository
from zellige.application.artifacts import StoreArtifact
from zellige.database import Database
from zellige.domain.artifacts import Artifact


class MemoryArtifacts:
    def __init__(self):
        self.records = {}

    def save_if_absent(self, artifact: Artifact) -> Artifact:
        return self.records.setdefault(artifact.sha256, artifact)


class MemoryBlobs:
    def __init__(self):
        self.content = {}

    def put(self, storage_key: str, content: bytes) -> None:
        self.content[storage_key] = content


class StoreArtifactTests(unittest.TestCase):
    def test_use_case_without_database_or_filesystem(self):
        repository, blobs = MemoryArtifacts(), MemoryBlobs()
        use_case = StoreArtifact(repository, blobs, lambda: 123)
        artifact = use_case.execute(b"hello", "")
        self.assertEqual(artifact.sha256, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824")
        self.assertEqual(artifact.id, f"artifact_sha256_{artifact.sha256}")
        self.assertEqual(artifact.media_type, "application/octet-stream")
        self.assertEqual(artifact.created_at, 123)
        self.assertEqual(artifact.size_bytes, 5)
        self.assertEqual(blobs.content[artifact.storage_key], b"hello")
        self.assertEqual(use_case.execute(b"hello", "text/plain"), artifact)
        self.assertEqual(len(repository.records), 1)

    def test_blob_failure_does_not_persist_metadata(self):
        repository, blobs = MemoryArtifacts(), MemoryBlobs()
        use_case = StoreArtifact(repository, blobs, lambda: 123)
        with patch.object(blobs, "put", side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                use_case.execute(b"hello", "text/plain")
        self.assertEqual(repository.records, {})


class ArtifactAdapterTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.database = Database(
            self.root / "test.sqlite3", Path(__file__).resolve().parents[1] / "migrations"
        )
        self.blobs = FileBlobStore(self.root / "blobs")
        self.use_case = StoreArtifact(SQLiteArtifactRepository(self.database), self.blobs, lambda: 123)

    def test_concurrent_duplicate_uploads_publish_one_change(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            artifacts = list(pool.map(lambda _: self.use_case.execute(b"same", "text/plain"), range(8)))
        self.assertTrue(all(artifact == artifacts[0] for artifact in artifacts))
        duplicate = self.use_case.execute(b"same", "application/octet-stream")
        self.assertEqual(duplicate, artifacts[0])
        self.assertEqual((self.blobs.root / duplicate.storage_key).read_bytes(), b"same")
        with self.database.transaction() as connection:
            self.assertEqual(connection.execute("SELECT count(*) FROM artifacts").fetchone()[0], 1)
            self.assertEqual(connection.execute("SELECT count(*) FROM changes").fetchone()[0], 1)

    def test_change_failure_rolls_back_metadata_and_retry_recovers(self):
        with self.database.transaction() as connection:
            connection.execute("""CREATE TRIGGER fail_change BEFORE INSERT ON changes
                                  BEGIN SELECT RAISE(ABORT, 'test failure'); END""")
        with self.assertRaises(sqlite3.IntegrityError):
            self.use_case.execute(b"retry", "text/plain")
        with self.database.transaction() as connection:
            self.assertEqual(connection.execute("SELECT count(*) FROM artifacts").fetchone()[0], 0)
            self.assertEqual(connection.execute("SELECT count(*) FROM changes").fetchone()[0], 0)
            connection.execute("DROP TRIGGER fail_change")
        artifact = self.use_case.execute(b"retry", "text/plain")
        self.assertEqual((self.blobs.root / artifact.storage_key).read_bytes(), b"retry")
        with self.database.transaction() as connection:
            self.assertEqual(connection.execute("SELECT count(*) FROM changes").fetchone()[0], 1)

    def test_failed_publish_cleans_temporary_file(self):
        with patch("zellige.adapters.artifacts.os.replace", side_effect=OSError("test failure")):
            with self.assertRaises(OSError):
                self.use_case.execute(b"hello", "text/plain")
        self.assertEqual([path for path in self.blobs.root.rglob("*") if path.is_file()], [])
