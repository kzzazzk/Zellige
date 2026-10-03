import hashlib

from zellige.application.ports import ArtifactRepository, BlobStore, Clock
from zellige.domain.artifacts import Artifact


class StoreArtifact:
    def __init__(self, repository: ArtifactRepository, blobs: BlobStore, clock: Clock):
        self.repository = repository
        self.blobs = blobs
        self.clock = clock

    def execute(self, content: bytes, media_type: str) -> Artifact:
        digest = hashlib.sha256(content).hexdigest()
        storage_key = f"sha256/{digest[:2]}/{digest[2:]}"
        # Persist the bytes first so committed metadata never points to missing content.
        self.blobs.put(storage_key, content)
        return self.repository.save_if_absent(Artifact(
            id=f"artifact_sha256_{digest}",
            sha256=digest,
            size_bytes=len(content),
            media_type=media_type or "application/octet-stream",
            storage_key=storage_key,
            created_at=self.clock(),
        ))
