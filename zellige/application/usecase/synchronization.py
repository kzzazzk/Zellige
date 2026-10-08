from dataclasses import dataclass
from typing import Protocol

from zellige.application.port.persistence.change_repository import Change


@dataclass(frozen=True, kw_only=True)
class ChangePage:
    changes: list[Change]
    next_cursor: int
    has_more: bool


class SynchronizationUseCase(Protocol):
    def changes(self, cursor: int, limit: int) -> ChangePage: ...
