from dataclasses import dataclass

from zellige.application.port.blob_store import BlobStore
from zellige.application.port.clock import Clock
from zellige.application.port.persistence.unit_of_work import UnitOfWork
from zellige.application.usecase.artifact import ArtifactUseCase
from zellige.domain.model.artifact import Artifact


@dataclass
class ArtifactService(ArtifactUseCase):
    unit_of_work: UnitOfWork
    blobs: BlobStore
    clock: Clock

    def put(self, content: bytes, media_type: str) -> Artifact:
        artifact = Artifact.from_content(content, media_type, self.clock())
        # Bytes first, so committed metadata never points to missing content.
        self.blobs.put(artifact.storage_key, content)
        with self.unit_of_work.write() as repositories:
            return repositories.artifacts.save_if_absent(artifact)
