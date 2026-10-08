from typing import Protocol

from zellige.domain.model.run import Run


class RunQueries(Protocol):
    def find_by_id(self, conversation_id: str, run_id: str) -> Run | None: ...

    def find_all(self, conversation_id: str, limit: int, offset: int) -> list[Run]: ...


class RunRepository(RunQueries, Protocol):
    def add(self, run: Run) -> None: ...
