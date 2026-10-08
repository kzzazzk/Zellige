from __future__ import annotations

from zellige.adapter.web.dto.api_model import APIModel
from zellige.domain.model.payload import NonEmptyString
from zellige.domain.model.types import JsonObject


class RuntimeProfile(APIModel):
    id: str
    name: str
    description: str | None
    created_at: int


class RuntimeProfileVersion(APIModel):
    id: str
    runtime_profile_id: str
    version: int
    definition: JsonObject
    created_at: int


class RuntimeProfileListResponse(APIModel):
    profiles: list[CreateRuntimeProfileResponse]


class CreateRuntimeProfileRequest(APIModel):
    id: NonEmptyString | None = None
    version_id: NonEmptyString | None = None
    name: NonEmptyString
    description: str | None = None
    definition: JsonObject


class CreateRuntimeProfileResponse(APIModel):
    runtime_profile: RuntimeProfile
    version: RuntimeProfileVersion
