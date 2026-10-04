from typing import Any, Literal


class DomainError(Exception):
    """A transport-independent failure understood by callers of the application."""

    def __init__(
        self, kind: Literal["invalid", "not_found", "conflict", "internal"],
        code: str, message: str, details: Any = None,
    ):
        super().__init__(message)
        self.kind = kind
        self.code = code
        self.message = message
        self.details = details


class PersistenceConflict(Exception):
    """A repository constraint failed; infrastructure exceptions must not escape."""
