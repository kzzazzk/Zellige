import hashlib
from dataclasses import dataclass


@dataclass(frozen=True)
class Artifact:
    id: str
    sha256: str
    size_bytes: int
    media_type: str
    storage_key: str
    created_at: int

    @classmethod
    def from_content(cls, content: bytes, media_type: str, now: int) -> "Artifact":
        digest = hashlib.sha256(content).hexdigest()
        return cls(
            id=f"artifact_sha256_{digest}",
            sha256=digest,
            size_bytes=len(content),
            media_type=media_type or "application/octet-stream",
            storage_key=f"sha256/{digest[:2]}/{digest[2:]}",
            created_at=now,
        )
