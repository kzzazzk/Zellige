"""Item payload validation against the canonical schema (schemas/item-payload.schema.json).

The schema is expressed once, as the pydantic ItemPayload model that also documents the
HTTP API; reusing it here keeps a single source of truth for what a valid item is.
"""
from __future__ import annotations

from typing import Any

from pydantic import TypeAdapter, ValidationError

from zellige.api_models import ItemPayload
from zellige.domain.errors import DomainError


ITEM_KINDS = {"message", "tool_call", "tool_result", "activity", "artifact"}
_payload_adapter = TypeAdapter(ItemPayload)


def validate_payload(kind: str, payload: Any, schema_version: int) -> dict[str, Any]:
    if schema_version != 1:
        raise DomainError("invalid", "invalid_payload", "unsupported payload schema version")
    if kind not in ITEM_KINDS:
        raise DomainError("invalid", "invalid_payload", "unsupported item kind")

    try:
        value = _payload_adapter.validate_python(payload)
    except ValidationError as error:
        raise DomainError("invalid", "invalid_payload", str(error)) from error

    if value.type != kind:
        raise DomainError("invalid", "invalid_payload", "payload.type must match item kind")
    return value.model_dump(mode="json", exclude_none=True)
