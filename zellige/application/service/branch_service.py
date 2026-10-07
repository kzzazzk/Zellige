from dataclasses import dataclass

from zellige.application.port.clock import Clock
from zellige.application.port.persistence.persistence_conflict import (
    PersistenceConflict,
)
from zellige.application.port.persistence.unit_of_work import UnitOfWork
from zellige.application.service.lookups import require_branch, require_conversation
from zellige.application.usecase.branch import (
    AppendItem,
    BranchHistory,
    BranchList,
    BranchUseCase,
    CreateBranch,
)
from zellige.domain.exception.domain_error import ConflictError
from zellige.domain.model.branch import Branch
from zellige.domain.model.item import Item
from zellige.domain.service.item_history import ItemHistory


@dataclass
class BranchService(BranchUseCase):
    unit_of_work: UnitOfWork
    clock: Clock

    def list(self, conversation_id: str) -> BranchList:
        with self.unit_of_work.read() as repositories:
            require_conversation(repositories, conversation_id)
            return BranchList(branches=repositories.branches.find_all(conversation_id))

    def create(self, conversation_id: str, command: CreateBranch) -> Branch:
        branch = Branch.create(
            id=command.id,
            conversation_id=conversation_id,
            name=command.name,
            head_item_id=command.head_item_id,
            now=self.clock(),
        )
        try:
            with self.unit_of_work.write() as repositories:
                repositories.branches.add(branch)
        except PersistenceConflict as error:
            raise ConflictError(
                "invalid_branch", "branch name, id, or head is invalid"
            ) from error
        return branch

    def append(self, conversation_id: str, branch_id: str, command: AppendItem) -> Item:
        now = self.clock()
        item = Item.create(
            id=command.id,
            conversation_id=conversation_id,
            parent_item_id=command.expected_head_item_id,
            run_id=command.run_id,
            kind=command.kind,
            payload_schema_version=command.payload_schema_version,
            payload=command.payload,
            now=now,
        )
        try:
            with self.unit_of_work.write() as repositories:
                branch = require_branch(repositories, conversation_id, branch_id)
                branch.check_head(command.expected_head_item_id)
                if command.run_id is not None:
                    run = repositories.runs.find_by_id(conversation_id, command.run_id)
                    if run is None or run.branch_id != branch_id:
                        raise ConflictError(
                            "invalid_item",
                            "run must belong to the target conversation and branch",
                        )
                repositories.items.add(item, item.artifact_links())
                moved = branch.advance_head(item.id, now)
                if not repositories.branches.move_head(
                    moved, command.expected_head_item_id
                ):
                    raise ConflictError("head_conflict", "branch head has changed")
                conversation = repositories.conversations.find_by_id(
                    conversation_id, include_deleted=True
                )
                assert (
                    conversation is not None
                )  # every stored branch belongs to a conversation
                repositories.conversations.save(conversation.touch(now))
        except PersistenceConflict as error:
            raise ConflictError(
                "invalid_item", "item id, parent, or run is invalid"
            ) from error
        return item

    def history(self, conversation_id: str, branch_id: str) -> BranchHistory:
        with self.unit_of_work.read() as repositories:
            branch = require_branch(repositories, conversation_id, branch_id)
            items = ItemHistory.read(
                branch.head_item_id,
                lambda item_id: repositories.items.find_by_id(conversation_id, item_id),
            )
        return BranchHistory(branch=branch, items=items)
