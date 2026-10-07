from dataclasses import dataclass, replace

from zellige.domain.exception.domain_error import ConflictError, InvalidError
from zellige.domain.model.identifiers import Identifiers
from zellige.domain.service.validation import require_names


@dataclass(frozen=True, kw_only=True)
class Conversation:
    id: str
    title: str
    created_at: int
    updated_at: int
    deleted_at: int | None
    archived_at: int | None

    @classmethod
    def create(cls, *, id: str | None, title: str, now: int) -> "Conversation":
        conversation_id = id or Identifiers.new("conv")
        require_names(conversation_id, title)
        return cls(
            id=conversation_id,
            title=title,
            created_at=now,
            updated_at=now,
            deleted_at=None,
            archived_at=None,
        )

    def touch(self, now: int) -> "Conversation":
        return replace(self, updated_at=max(now, self.updated_at + 1))

    def revise(
        self,
        *,
        expected_updated_at: int,
        title: str | None = None,
        archived: bool | None = None,
        now: int,
    ) -> "Conversation":
        if self.updated_at != expected_updated_at:
            raise ConflictError(
                "conversation_conflict",
                "conversation changed; refresh before saving",
            )
        if title is None and archived is None:
            raise InvalidError("invalid_request", "title or archived is required")
        if title is not None:
            require_names(title)
        revised = self.touch(now)
        archived_at = self.archived_at
        if archived is not None:
            if not isinstance(archived, bool):
                raise InvalidError("invalid_request", "archived must be a boolean")
            archived_at = revised.updated_at if archived else None
        return replace(
            revised,
            title=self.title if title is None else title,
            archived_at=archived_at,
        )
