from typing import Protocol

from zellige.domain.model.artifact import Artifact


class ArtifactRepository(Protocol):
    def save_if_absent(self, artifact: Artifact) -> Artifact:
        """Store metadata unless the digest exists; return the first stored record.
        Only a new record is logged, so duplicate uploads publish one change."""
        ...
