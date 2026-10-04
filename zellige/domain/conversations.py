"""Conversation rules, as pure functions: no storage, no transport."""
from collections.abc import Callable

from zellige.domain.errors import DomainError
from zellige.domain.models import Conversation, Item, Record


def require_names(*values: object) -> None:
    if not all(isinstance(value, str) and value for value in values):
        raise DomainError("invalid", "invalid_request", "fields must be non-empty strings")


def bump(previous: int, now: int) -> int:
    """A version timestamp that always advances, even if the clock moves backwards."""
    return max(now, previous + 1)


def check_head(expected: str | None, actual: str | None) -> None:
    if actual != expected:
        raise DomainError("conflict", "head_conflict", "branch head has changed", {
            "expected_head_item_id": expected, "actual_head_item_id": actual,
        })


def revise_conversation(conversation: Conversation, changes: Record, now: int) -> Conversation:
    if conversation["updated_at"] != changes.get("expected_updated_at"):
        raise DomainError("conflict", "conversation_conflict", "conversation changed; refresh before saving")
    if not any(key in changes for key in ("title", "archived")):
        raise DomainError("invalid", "invalid_request", "title or archived is required")
    revised = conversation.copy()
    if "title" in changes:
        require_names(changes["title"])
        revised["title"] = changes["title"]
    timestamp = bump(conversation["updated_at"], now)
    if "archived" in changes:
        if not isinstance(changes["archived"], bool):
            raise DomainError("invalid", "invalid_request", "archived must be a boolean")
        revised["archived_at"] = timestamp if changes["archived"] else None
    revised["updated_at"] = timestamp
    return revised


def artifact_links(payload: Record) -> list[tuple[str, str, int]]:
    """(artifact_id, role, ordinal) for every artifact an item payload references."""
    if payload["type"] in {"message", "tool_result"}:
        return [
            (block["artifact_id"], block["type"], ordinal)
            for ordinal, block in enumerate(payload["content"])
            if block["type"] != "text"
        ]
    if payload["type"] == "artifact":
        return [(payload["artifact_id"], "primary", 0)]
    return []


def ancestry(head: str | None, get: Callable[[str], Item | None]) -> list[Item]:
    """Items from the root to `head`, following parent links."""
    items: list[Item] = []
    seen: set[str] = set()
    current = head
    while current is not None:
        if current in seen:
            raise DomainError("internal", "history_cycle", "cycle detected in item ancestry")
        seen.add(current)
        item = get(current)
        if item is None:
            raise DomainError("internal", "broken_history", "branch ancestry is incomplete")
        items.append(item)
        current = item["parent_item_id"]
    items.reverse()
    return items
