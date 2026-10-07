from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, TypeAdapter, model_validator


NonEmptyString = Annotated[str, StringConstraints(min_length=1)]
JsonObject = dict[str, Any]


class APIModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TextBlock(APIModel):
    type: Literal["text"]
    text: str


class ArtifactBlock(APIModel):
    type: Literal["image", "file", "audio", "video"]
    artifact_id: NonEmptyString
    alt: str | None = None


ContentBlock = Annotated[TextBlock | ArtifactBlock, Field(discriminator="type")]


class MessagePayload(APIModel):
    type: Literal["message"]
    role: Literal["user", "assistant", "system"]
    content: list[ContentBlock]


class ToolCallPayload(APIModel):
    type: Literal["tool_call"]
    call_id: NonEmptyString
    name: NonEmptyString
    arguments: JsonObject


class ToolError(APIModel):
    code: str
    message: str


class ToolResultPayload(APIModel):
    type: Literal["tool_result"]
    call_id: NonEmptyString
    status: Literal["ok", "error"]
    content: list[ContentBlock]
    error: ToolError | None = None


class ActivityPayload(APIModel):
    type: Literal["activity"]
    name: NonEmptyString
    status: Literal["started", "progress", "completed", "failed"]
    details: JsonObject


class ArtifactPayload(APIModel):
    type: Literal["artifact"]
    artifact_id: NonEmptyString
    label: str
    metadata: JsonObject | None = None


ItemPayload = Annotated[
    MessagePayload | ToolCallPayload | ToolResultPayload | ActivityPayload | ArtifactPayload,
    Field(discriminator="type"),
]


class ErrorDetail(APIModel):
    code: str
    message: str
    details: Any | None = None


class ErrorResponse(APIModel):
    error: ErrorDetail


class HealthResponse(APIModel):
    status: Literal["ok"]
    database: str


class Conversation(APIModel):
    id: str
    title: str
    created_at: int
    updated_at: int
    deleted_at: int | None
    archived_at: int | None = None


class ConversationListResponse(APIModel):
    conversations: list[Conversation]
    has_more: bool


class UpdateConversationRequest(APIModel):
    expected_updated_at: int
    title: NonEmptyString | None = None
    archived: bool | None = None

    @model_validator(mode="after")
    def require_change(self) -> UpdateConversationRequest:
        if self.title is None and self.archived is None:
            raise ValueError("title or archived is required")
        if self.title is not None:
            self.title = self.title.strip()
            if not self.title:
                raise ValueError("title must not be blank")
        return self


class Branch(APIModel):
    id: str
    conversation_id: str
    name: str
    head_item_id: str | None
    created_at: int
    updated_at: int


class BranchListResponse(APIModel):
    branches: list[Branch]


class CreateConversationRequest(APIModel):
    id: NonEmptyString | None = None
    branch_id: NonEmptyString | None = None
    title: NonEmptyString = "New conversation"
    branch_name: NonEmptyString = "main"


class CreateConversationResponse(APIModel):
    conversation: Conversation
    branch: Branch


class CreateBranchRequest(APIModel):
    id: NonEmptyString | None = None
    name: NonEmptyString
    head_item_id: str | None = None


ItemKind = Literal["message", "tool_call", "tool_result", "activity", "artifact"]


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


class Item(APIModel):
    id: str
    conversation_id: str
    parent_item_id: str | None
    run_id: str | None
    kind: ItemKind
    payload_schema_version: Literal[1]
    payload: ItemPayload
    created_at: int


class BranchHistoryResponse(APIModel):
    branch: Branch
    items: list[Item]


class CreateRuntimeProfileRequest(APIModel):
    id: NonEmptyString | None = None
    version_id: NonEmptyString | None = None
    name: NonEmptyString
    description: str | None = None
    definition: JsonObject


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


class CreateRuntimeProfileResponse(APIModel):
    runtime_profile: RuntimeProfile
    version: RuntimeProfileVersion


class RuntimeProfileListResponse(APIModel):
    profiles: list[CreateRuntimeProfileResponse]


class CreateContextPackRequest(APIModel):
    id: NonEmptyString | None = None
    version_id: NonEmptyString | None = None
    name: NonEmptyString
    description: str | None = None
    manifest: JsonObject


class ContextPack(APIModel):
    id: str
    name: str
    description: str | None
    created_at: int


class ContextPackVersion(APIModel):
    id: str
    context_pack_id: str
    version: int
    manifest: JsonObject
    created_at: int


class CreateContextPackResponse(APIModel):
    context_pack: ContextPack
    version: ContextPackVersion


class CreateContextPackVersionRequest(APIModel):
    id: NonEmptyString | None = None
    manifest: JsonObject


class CreateRunRequest(APIModel):
    id: NonEmptyString | None = None
    conversation_id: NonEmptyString
    branch_id: NonEmptyString
    runtime_profile_version_id: NonEmptyString
    provider_session_id: NonEmptyString | None = None
    request: JsonObject = Field(default_factory=dict)
    context_pack_version_ids: list[NonEmptyString] = Field(default_factory=list)


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
    context_pack_version_ids: list[str]


class RunListResponse(APIModel):
    runs: list[Run]


class ClaimRunRequest(APIModel):
    harness: NonEmptyString


class RunWorkPackage(APIModel):
    run: Run
    runtime_profile_version: RuntimeProfileVersion
    items: list[Item]
    context_pack_versions: list[ContextPackVersion]


class ClaimRunResponse(APIModel):
    work: RunWorkPackage | None


class FinishRunRequest(APIModel):
    status: Literal["completed", "failed"]
    result: JsonObject


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


class Artifact(APIModel):
    id: str
    sha256: str
    size_bytes: int
    media_type: str
    storage_key: str
    created_at: int


def item_payload_json_schema() -> dict[str, Any]:
    schema = TypeAdapter(ItemPayload).json_schema(ref_template="#/$defs/{model}")
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "https://zellige.dev/schemas/item-payload/v1",
        "title": "Zellige item payload v1",
        **schema,
    }


def write_item_payload_json_schema(path: Path) -> None:
    path.write_text(
        json.dumps(item_payload_json_schema(), ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def export_schemas() -> None:
    parser = argparse.ArgumentParser(description="Export Zellige JSON Schemas")
    parser.add_argument(
        "output",
        nargs="?",
        type=Path,
        default=Path("db/schemas/item-payload.schema.json"),
    )
    output = parser.parse_args().output
    output.parent.mkdir(parents=True, exist_ok=True)
    write_item_payload_json_schema(output)
