from __future__ import annotations

from typing import Any

from pydantic import TypeAdapter, ValidationError

from .api_models import ItemPayload


ITEM_KINDS = {"message", "tool_call", "tool_result", "activity", "artifact"}
_payload_adapter = TypeAdapter(ItemPayload)


class PayloadError(ValueError):
    pass


def validate_payload(kind: str, payload: Any, schema_version: int) -> dict[str, Any]:
    if schema_version != 1:
        raise PayloadError("unsupported payload schema version")
    if kind not in ITEM_KINDS:
        raise PayloadError("unsupported item kind")

    try:
        value = _payload_adapter.validate_python(payload)
    except ValidationError as error:
        raise PayloadError(str(error)) from error

    if value.type != kind:
        raise PayloadError("payload.type must match item kind")
    return value.model_dump(mode="json", exclude_none=True)
