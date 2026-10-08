from dataclasses import dataclass

from zellige.application.usecase.artifact import ArtifactUseCase
from zellige.application.usecase.branch import BranchUseCase
from zellige.application.usecase.conversation import ConversationUseCase
from zellige.application.usecase.run import RunUseCase
from zellige.application.usecase.runtime_profile import (
    RuntimeProfileUseCase,
)
from zellige.application.usecase.synchronization import (
    SynchronizationUseCase,
)
from zellige.application.usecase.system import SystemUseCase


@dataclass(frozen=True)
class Zellige:
    """Every use case, as received by entry adapters; configuration supplies them."""

    conversations: ConversationUseCase
    branches: BranchUseCase
    profiles: RuntimeProfileUseCase
    runs: RunUseCase
    synchronization: SynchronizationUseCase
    artifacts: ArtifactUseCase
    system: SystemUseCase
