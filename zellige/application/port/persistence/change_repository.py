from dataclasses import dataclass
from typing import Literal, Protocol

from zellige.domain.model.types import JsonObject


@dataclass(frozen=True, kw_only=True)
class Change:
    """A synchronization change record with its persisted cursor."""

    seq: int
    conversation_id: str | None
    entity_type: str
    entity_id: str
    operation: Literal["upsert", "delete"]
    data: JsonObject
    changed_at: int


class ChangeRepository(Protocol):
    def find_after(self, cursor: int, limit: int) -> list[Change]: ...
