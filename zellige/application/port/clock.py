from typing import Protocol


class Clock(Protocol):
    def __call__(self) -> int:
        """Return Unix time in microseconds."""
        ...
