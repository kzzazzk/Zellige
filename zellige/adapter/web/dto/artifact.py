from __future__ import annotations

from zellige.adapter.web.dto.api_model import APIModel


class Artifact(APIModel):
    id: str
    sha256: str
    size_bytes: int
    media_type: str
    storage_key: str
    created_at: int
