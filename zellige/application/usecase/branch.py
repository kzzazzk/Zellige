from dataclasses import dataclass
from typing import Protocol

from zellige.domain.model.branch import Branch
from zellige.domain.model.item import Item
from zellige.domain.model.types import ItemKind, JsonObject


@dataclass(frozen=True, kw_only=True)
class CreateBranch:
    name: str
    id: str | None = None
    head_item_id: str | None = None


@dataclass(frozen=True, kw_only=True)
class AppendItem:
    expected_head_item_id: str | None
    kind: ItemKind
    payload: JsonObject
    id: str | None = None
    run_id: str | None = None
    payload_schema_version: int = 1


@dataclass(frozen=True, kw_only=True)
class BranchList:
    branches: list[Branch]


@dataclass(frozen=True, kw_only=True)
class BranchHistory:
    branch: Branch
    items: list[Item]


class BranchUseCase(Protocol):
    def list(self, conversation_id: str) -> BranchList: ...

    def create(self, conversation_id: str, command: CreateBranch) -> Branch: ...

    def append(self, conversation_id: str, branch_id: str, command: AppendItem) -> Item:
        """Append at the expected head; a stale head is a conflict, never a rebase."""
        ...

    def history(self, conversation_id: str, branch_id: str) -> BranchHistory: ...
