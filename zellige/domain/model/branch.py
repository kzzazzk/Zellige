from dataclasses import dataclass, replace

from zellige.domain.exception.domain_error import ConflictError
from zellige.domain.model.identifiers import Identifiers
from zellige.domain.service.validation import require_names


@dataclass(frozen=True, kw_only=True)
class Branch:
    id: str
    conversation_id: str
    name: str
    head_item_id: str | None
    created_at: int
    updated_at: int

    @classmethod
    def create(
        cls,
        *,
        id: str | None,
        conversation_id: str,
        name: str,
        head_item_id: str | None,
        now: int,
    ) -> "Branch":
        branch_id = id or Identifiers.new("branch")
        require_names(branch_id, name)
        return cls(
            id=branch_id,
            conversation_id=conversation_id,
            name=name,
            head_item_id=head_item_id,
            created_at=now,
            updated_at=now,
        )

    def check_head(self, expected: str | None) -> None:
        if self.head_item_id != expected:
            raise ConflictError(
                "head_conflict",
                "branch head has changed",
                {
                    "expected_head_item_id": expected,
                    "actual_head_item_id": self.head_item_id,
                },
            )

    def advance_head(self, item_id: str, now: int) -> "Branch":
        return replace(
            self, head_item_id=item_id, updated_at=max(now, self.updated_at + 1)
        )
