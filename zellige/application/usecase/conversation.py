from dataclasses import dataclass
from typing import Protocol

from zellige.domain.model.branch import Branch
from zellige.domain.model.conversation import Conversation


@dataclass(frozen=True, kw_only=True)
class CreateConversation:
    id: str | None = None
    branch_id: str | None = None
    title: str = "New conversation"
    branch_name: str = "main"


@dataclass(frozen=True, kw_only=True)
class UpdateConversation:
    expected_updated_at: int
    title: str | None = None
    archived: bool | None = None


@dataclass(frozen=True, kw_only=True)
class CreatedConversation:
    conversation: Conversation
    branch: Branch


@dataclass(frozen=True, kw_only=True)
class ConversationPage:
    conversations: list[Conversation]
    has_more: bool


class ConversationUseCase(Protocol):
    def create(self, command: CreateConversation) -> CreatedConversation: ...

    def list(
        self,
        archived: bool = False,
        query: str = "",
        limit: int = 50,
        offset: int = 0,
    ) -> ConversationPage: ...

    def get(self, conversation_id: str) -> Conversation: ...

    def update(
        self, conversation_id: str, command: UpdateConversation
    ) -> Conversation: ...
