from collections.abc import Callable

from zellige.domain.exception.domain_error import InternalError
from zellige.domain.model.item import Item


class ItemHistory:
    @staticmethod
    def read(head: str | None, get: Callable[[str], Item | None]) -> list[Item]:
        """Items from the root to `head`, following parent links."""
        items: list[Item] = []
        seen: set[str] = set()
        current = head
        while current is not None:
            if current in seen:
                raise InternalError("history_cycle", "cycle detected in item ancestry")
            seen.add(current)
            item = get(current)
            if item is None:
                raise InternalError("broken_history", "branch ancestry is incomplete")
            items.append(item)
            current = item.parent_item_id
        items.reverse()
        return items
