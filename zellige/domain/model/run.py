from dataclasses import dataclass

from zellige.domain.exception.domain_error import InvalidError
from zellige.domain.model.identifiers import Identifiers
from zellige.domain.model.types import JsonObject, RunStatus
from zellige.domain.service.validation import require_names


@dataclass(frozen=True, kw_only=True)
class Run:
    id: str
    conversation_id: str
    branch_id: str
    input_head_item_id: str | None
    runtime_profile_version_id: str
    provider_session_id: str | None
    status: RunStatus
    request: JsonObject
    result: JsonObject | None
    created_at: int
    started_at: int | None
    completed_at: int | None

    @classmethod
    def create(
        cls,
        *,
        id: str | None,
        conversation_id: str,
        branch_id: str,
        input_head_item_id: str | None,
        runtime_profile_version_id: str,
        provider_session_id: str | None,
        request: JsonObject,
        now: int,
    ) -> "Run":
        """A queued run pinned to the branch head it was created from."""
        require_names(conversation_id, branch_id, runtime_profile_version_id)
        if not isinstance(request, dict):
            raise InvalidError("invalid_request", "request must be an object")
        return cls(
            id=id or Identifiers.new("run"),
            conversation_id=conversation_id,
            branch_id=branch_id,
            input_head_item_id=input_head_item_id,
            runtime_profile_version_id=runtime_profile_version_id,
            provider_session_id=provider_session_id,
            status="queued",
            request=request,
            result=None,
            created_at=now,
            started_at=None,
            completed_at=None,
        )
