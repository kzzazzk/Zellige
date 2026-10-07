from dataclasses import dataclass

from zellige.application.port.clock import Clock
from zellige.application.port.persistence.persistence_conflict import (
    PersistenceConflict,
)
from zellige.application.port.persistence.unit_of_work import UnitOfWork
from zellige.application.service.lookups import require_conversation
from zellige.application.usecase.conversation import (
    ConversationPage,
    ConversationUseCase,
    CreateConversation,
    CreatedConversation,
    UpdateConversation,
)
from zellige.domain.exception.domain_error import ConflictError
from zellige.domain.model.branch import Branch
from zellige.domain.model.conversation import Conversation


@dataclass
class ConversationService(ConversationUseCase):
    unit_of_work: UnitOfWork
    clock: Clock

    def create(self, command: CreateConversation) -> CreatedConversation:
        now = self.clock()
        conversation = Conversation.create(id=command.id, title=command.title, now=now)
        branch = Branch.create(
            id=command.branch_id,
            conversation_id=conversation.id,
            name=command.branch_name,
            head_item_id=None,
            now=now,
        )
        try:
            with self.unit_of_work.write() as repositories:
                repositories.conversations.add(conversation)
                repositories.branches.add(branch)
        except PersistenceConflict as error:
            raise ConflictError(
                "already_exists", "conversation or branch already exists"
            ) from error
        return CreatedConversation(conversation=conversation, branch=branch)

    def list(
        self,
        archived: bool = False,
        query: str = "",
        limit: int = 50,
        offset: int = 0,
    ) -> ConversationPage:
        with self.unit_of_work.read() as repositories:
            rows = repositories.conversations.find_all(
                archived, query, limit + 1, offset
            )
        return ConversationPage(conversations=rows[:limit], has_more=len(rows) > limit)

    def get(self, conversation_id: str) -> Conversation:
        with self.unit_of_work.read() as repositories:
            return require_conversation(repositories, conversation_id)

    def update(self, conversation_id: str, command: UpdateConversation) -> Conversation:
        with self.unit_of_work.write() as repositories:
            revised = require_conversation(repositories, conversation_id).revise(
                expected_updated_at=command.expected_updated_at,
                title=command.title,
                archived=command.archived,
                now=self.clock(),
            )
            repositories.conversations.save(revised)
        return revised
