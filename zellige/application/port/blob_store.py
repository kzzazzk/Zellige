from typing import Protocol


class BlobStore(Protocol):
    def put(self, storage_key: str, content: bytes) -> None:
        """Persist bytes atomically at the key; repeated writes are safe."""
        ...
