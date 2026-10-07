from __future__ import annotations

from typing import Literal

from zellige.adapter.web.dto.api_model import APIModel
from zellige.domain.model.types import JsonObject


class Change(APIModel):
    seq: int
    conversation_id: str | None
    entity_type: str
    entity_id: str
    operation: Literal["upsert", "delete"]
    data: JsonObject
    changed_at: int


class ChangesResponse(APIModel):
    changes: list[Change]
    next_cursor: int
    has_more: bool
