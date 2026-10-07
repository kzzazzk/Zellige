from typing import Any, ClassVar, Literal

ErrorKind = Literal["invalid", "not_found", "conflict", "internal"]

# Every code a client can receive; a typo here is a type error, not a new code.
ErrorCode = Literal[
    "invalid_request",
    "invalid_payload",
    "invalid_cursor",
    "conversation_not_found",
    "branch_not_found",
    "already_exists",
    "conversation_conflict",
    "head_conflict",
    "invalid_branch",
    "invalid_item",
    "invalid_run",
    "history_cycle",
    "broken_history",
]


class DomainError(Exception):
    """A transport-independent failure; raise one of its subclasses."""

    kind: ClassVar[ErrorKind]

    def __init__(self, code: ErrorCode, message: str, details: Any = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details


class InvalidError(DomainError):
    """The input breaks a rule."""

    kind = "invalid"


class NotFoundError(DomainError):
    """The requested object does not exist."""

    kind = "not_found"


class ConflictError(DomainError):
    """The operation conflicts with the stored state."""

    kind = "conflict"


class InternalError(DomainError):
    """Stored data breaks an invariant."""

    kind = "internal"
