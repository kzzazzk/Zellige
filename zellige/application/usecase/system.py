from dataclasses import dataclass
from typing import Literal, Protocol


@dataclass(frozen=True, kw_only=True)
class Health:
    status: Literal["ok"]
    database: str


class SystemUseCase(Protocol):
    def health(self) -> Health: ...
