from dataclasses import dataclass, field
from typing import Protocol

from zellige.domain.model.run import Run
from zellige.domain.model.types import JsonObject


@dataclass(frozen=True, kw_only=True)
class CreateRun:
    conversation_id: str
    branch_id: str
    runtime_profile_version_id: str
    id: str | None = None
    provider_session_id: str | None = None
    request: JsonObject = field(default_factory=dict)


@dataclass(frozen=True, kw_only=True)
class RunList:
    runs: list[Run]
    has_more: bool


class RunUseCase(Protocol):
    def list(
        self, conversation_id: str, limit: int = 50, offset: int = 0
    ) -> RunList: ...

    def create(self, command: CreateRun) -> Run:
        """Queue a run against the branch head as it is now."""
        ...
