from dataclasses import dataclass


@dataclass(frozen=True)
class Artifact:
    id: str
    sha256: str
    size_bytes: int
    media_type: str
    storage_key: str
    created_at: int
