from typing import Protocol

from zellige.domain.model.item import Item


class ItemQueries(Protocol):
    def find_by_id(self, conversation_id: str, item_id: str) -> Item | None: ...


class ItemRepository(ItemQueries, Protocol):
    def add(self, item: Item, artifact_links: list[tuple[str, str, int]]) -> None: ...
