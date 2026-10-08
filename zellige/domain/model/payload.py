from __future__ import annotations

from typing import Annotated, Any, ClassVar, Literal, get_args

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    TypeAdapter,
    ValidationError,
)

from zellige.domain.exception.domain_error import InvalidError
from zellige.domain.model.types import ItemKind, JsonObject

NonEmptyString = Annotated[str, StringConstraints(min_length=1)]


class PayloadModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TextBlock(PayloadModel):
    type: Literal["text"]
    text: str


class ArtifactBlock(PayloadModel):
    type: Literal["image", "file", "audio", "video"]
    artifact_id: NonEmptyString
    alt: str | None = None


ContentBlock = Annotated[TextBlock | ArtifactBlock, Field(discriminator="type")]


class MessagePayload(PayloadModel):
    type: Literal["message"]
    role: Literal["user", "assistant", "system"]
    content: list[ContentBlock]


class ToolCallPayload(PayloadModel):
    type: Literal["tool_call"]
    call_id: NonEmptyString
    name: NonEmptyString
    arguments: JsonObject


class ToolError(PayloadModel):
    code: str
    message: str


class ToolResultPayload(PayloadModel):
    type: Literal["tool_result"]
    call_id: NonEmptyString
    status: Literal["ok", "error"]
    content: list[ContentBlock]
    error: ToolError | None = None


class ActivityPayload(PayloadModel):
    type: Literal["activity"]
    name: NonEmptyString
    status: Literal["started", "progress", "completed", "failed"]
    details: JsonObject


class ArtifactPayload(PayloadModel):
    type: Literal["artifact"]
    artifact_id: NonEmptyString
    label: str
    metadata: JsonObject | None = None


ItemPayload = Annotated[
    MessagePayload
    | ToolCallPayload
    | ToolResultPayload
    | ActivityPayload
    | ArtifactPayload,
    Field(discriminator="type"),
]


class PayloadValidator:
    _kinds: ClassVar[set[str]] = set(get_args(ItemKind))
    _adapter: TypeAdapter[ItemPayload] = TypeAdapter(ItemPayload)

    @classmethod
    def validate(cls, kind: str, payload: Any, schema_version: int) -> dict[str, Any]:
        if schema_version != 1:
            raise InvalidError("invalid_payload", "unsupported payload schema version")
        if kind not in cls._kinds:
            raise InvalidError("invalid_payload", "unsupported item kind")

        try:
            value = cls._adapter.validate_python(payload)
        except ValidationError as error:
            raise InvalidError("invalid_payload", str(error)) from error

        if value.type != kind:
            raise InvalidError("invalid_payload", "payload.type must match item kind")
        return value.model_dump(mode="json", exclude_none=True)
