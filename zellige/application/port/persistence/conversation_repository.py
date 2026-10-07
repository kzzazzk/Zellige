from typing import Protocol

from zellige.domain.model.conversation import Conversation


class ConversationQueries(Protocol):
    def find_by_id(
        self, conversation_id: str, *, include_deleted: bool = False
    ) -> Conversation | None: ...

    def find_all(
        self, archived: bool, query: str, limit: int, offset: int
    ) -> list[Conversation]: ...


class ConversationRepository(ConversationQueries, Protocol):
    def add(self, conversation: Conversation) -> None: ...

    def save(self, conversation: Conversation) -> None: ...
