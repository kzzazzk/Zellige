from __future__ import annotations

from typing import Literal

from pydantic import Field, model_validator

from zellige.adapter.web.dto.api_model import APIModel
from zellige.domain.model.payload import ItemPayload, NonEmptyString
from zellige.domain.model.types import ItemKind


class Item(APIModel):
    id: str
    conversation_id: str
    parent_item_id: str | None
    run_id: str | None
    kind: ItemKind
    payload_schema_version: Literal[1]
    payload: ItemPayload
    created_at: int


class AppendItemRequest(APIModel):
    id: NonEmptyString | None = None
    expected_head_item_id: str | None = Field(
        ...,
        description="Current branch head. Send null only when appending to an empty branch.",
    )
    run_id: str | None = None
    kind: ItemKind
    payload_schema_version: Literal[1] = 1
    payload: ItemPayload

    @model_validator(mode="after")
    def payload_type_matches_kind(self) -> AppendItemRequest:
        if self.payload.type != self.kind:
            raise ValueError("payload.type must match kind")
        return self
