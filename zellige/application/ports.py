from typing import Protocol

from zellige.domain.artifacts import Artifact


class BlobStore(Protocol):
    def put(self, storage_key: str, content: bytes) -> None:
        """Persist bytes atomically at the key; repeated writes are safe."""
        ...


class ArtifactRepository(Protocol):
    def save_if_absent(self, artifact: Artifact) -> Artifact:
        """Return canonical metadata, preserving the first write for a digest.

        A new record and its change event must commit in one transaction.
        Duplicate writes must not publish another event.
        """
        ...


class Clock(Protocol):
    def __call__(self) -> int:
        """Return Unix time in microseconds."""
        ...
