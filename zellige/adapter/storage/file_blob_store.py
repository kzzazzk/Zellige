import os
import uuid
from pathlib import Path


class FileBlobStore:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def put(self, storage_key: str, content: bytes) -> None:
        target = self.root / storage_key
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            return
        temporary = target.with_name(
            f".{target.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp"
        )
        try:
            temporary.write_bytes(content)
            os.replace(temporary, target)
        finally:
            temporary.unlink(missing_ok=True)
