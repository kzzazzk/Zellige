from __future__ import annotations

from typing import Literal

from pydantic import Field

from zellige.adapter.web.dto.api_model import APIModel
from zellige.domain.model.payload import NonEmptyString
from zellige.domain.model.types import JsonObject


class Run(APIModel):
    id: str
    conversation_id: str
    branch_id: str
    input_head_item_id: str | None
    runtime_profile_version_id: str
    provider_session_id: str | None
    status: Literal["queued", "running", "completed", "failed", "cancelled"]
    request: JsonObject
    result: JsonObject | None
    created_at: int
    started_at: int | None
    completed_at: int | None


class RunListResponse(APIModel):
    runs: list[Run]
    has_more: bool


class CreateRunRequest(APIModel):
    id: NonEmptyString | None = None
    conversation_id: NonEmptyString
    branch_id: NonEmptyString
    runtime_profile_version_id: NonEmptyString
    provider_session_id: NonEmptyString | None = None
    request: JsonObject = Field(default_factory=dict)
