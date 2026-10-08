from contextlib import AbstractContextManager
from dataclasses import dataclass
from typing import Protocol

from zellige.application.port.persistence.artifact_repository import (
    ArtifactRepository,
)
from zellige.application.port.persistence.branch_repository import (
    BranchQueries,
    BranchRepository,
)
from zellige.application.port.persistence.change_repository import (
    ChangeRepository,
)
from zellige.application.port.persistence.conversation_repository import (
    ConversationQueries,
    ConversationRepository,
)
from zellige.application.port.persistence.item_repository import (
    ItemQueries,
    ItemRepository,
)
from zellige.application.port.persistence.run_repository import (
    RunQueries,
    RunRepository,
)
from zellige.application.port.persistence.runtime_profile_repository import (
    RuntimeProfileQueries,
    RuntimeProfileRepository,
)


class ReadRepositories(Protocol):
    @property
    def conversations(self) -> ConversationQueries: ...

    @property
    def branches(self) -> BranchQueries: ...

    @property
    def items(self) -> ItemQueries: ...

    @property
    def runs(self) -> RunQueries: ...

    @property
    def runtime_profiles(self) -> RuntimeProfileQueries: ...

    @property
    def changes(self) -> ChangeRepository: ...


@dataclass(frozen=True)
class Repositories:
    """Repository operations sharing one transaction."""

    conversations: ConversationRepository
    branches: BranchRepository
    items: ItemRepository
    runs: RunRepository
    runtime_profiles: RuntimeProfileRepository
    changes: ChangeRepository
    artifacts: ArtifactRepository


class UnitOfWork(Protocol):
    def read(self) -> AbstractContextManager[ReadRepositories]:
        """All repository queries in this scope observe one snapshot."""
        ...

    def write(self) -> AbstractContextManager[Repositories]:
        """One serialized transaction across repositories and change events.

        Constraint failures, including at commit, raise PersistenceConflict.
        Any failure rolls back every write and event in the scope.
        """
        ...

    def check(self) -> str:
        """Return the storage integrity status."""
        ...
