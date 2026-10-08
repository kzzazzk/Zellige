from typing import Protocol

from zellige.domain.model.branch import Branch


class BranchQueries(Protocol):
    def find_by_id(self, conversation_id: str, branch_id: str) -> Branch | None:
        """Every returned branch belongs to a stored conversation."""
        ...

    def find_all(self, conversation_id: str) -> list[Branch]: ...


class BranchRepository(BranchQueries, Protocol):
    def add(self, branch: Branch) -> None: ...

    def move_head(self, branch: Branch, expected_head: str | None) -> bool:
        """Save the branch only if its head is still `expected_head`."""
        ...
