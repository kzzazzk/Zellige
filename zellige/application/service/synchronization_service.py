from dataclasses import dataclass

from zellige.application.port.persistence.unit_of_work import UnitOfWork
from zellige.application.usecase.synchronization import (
    ChangePage,
    SynchronizationUseCase,
)
from zellige.domain.exception.domain_error import InvalidError


@dataclass
class SynchronizationService(SynchronizationUseCase):
    unit_of_work: UnitOfWork

    def changes(self, cursor: int, limit: int) -> ChangePage:
        if cursor < 0 or not 1 <= limit <= 1_000:
            raise InvalidError(
                "invalid_cursor",
                "cursor must be non-negative and limit between 1 and 1000",
            )
        with self.unit_of_work.read() as repositories:
            rows = repositories.changes.find_after(cursor, limit + 1)
        selected = rows[:limit]
        return ChangePage(
            changes=selected,
            next_cursor=selected[-1].seq if selected else cursor,
            has_more=len(rows) > limit,
        )
