from typing import Protocol

from zellige.domain.model.artifact import Artifact


class ArtifactUseCase(Protocol):
    def put(self, content: bytes, media_type: str) -> Artifact:
        """Store bytes by content; identical uploads return the first stored artifact."""
        ...
