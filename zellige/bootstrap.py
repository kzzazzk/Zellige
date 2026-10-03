"""Composition of use cases with production infrastructure."""

from pathlib import Path

from zellige.adapters.artifacts import FileBlobStore, SQLiteArtifactRepository
from zellige.application.artifacts import StoreArtifact
from zellige.database import Database, now_us


def build_artifact_use_case(database: Database, blob_dir: Path) -> StoreArtifact:
    return StoreArtifact(SQLiteArtifactRepository(database), FileBlobStore(blob_dir), now_us)
