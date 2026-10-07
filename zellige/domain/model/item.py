from dataclasses import dataclass

from zellige.domain.model.identifiers import Identifiers
from zellige.domain.model.payload import PayloadValidator
from zellige.domain.model.types import ItemKind, JsonObject


@dataclass(frozen=True, kw_only=True)
class Item:
    id: str
    conversation_id: str
    parent_item_id: str | None
    run_id: str | None
    kind: ItemKind
    payload_schema_version: int
    payload: JsonObject
    created_at: int

    @classmethod
    def create(
        cls,
        *,
        id: str | None,
        conversation_id: str,
        parent_item_id: str | None,
        run_id: str | None,
        kind: ItemKind,
        payload_schema_version: int,
        payload: JsonObject,
        now: int,
    ) -> "Item":
        """Validate the payload against its kind; the parent is the expected head."""
        return cls(
            id=id or Identifiers.new("item"),
            conversation_id=conversation_id,
            parent_item_id=parent_item_id,
            run_id=run_id,
            kind=kind,
            payload_schema_version=payload_schema_version,
            payload=PayloadValidator.validate(kind, payload, payload_schema_version),
            created_at=now,
        )

    def artifact_links(self) -> list[tuple[str, str, int]]:
        if self.payload["type"] in {"message", "tool_result"}:
            return [
                (block["artifact_id"], block["type"], ordinal)
                for ordinal, block in enumerate(self.payload["content"])
                if block["type"] != "text"
            ]
        if self.payload["type"] == "artifact":
            return [(self.payload["artifact_id"], "primary", 0)]
        return []
