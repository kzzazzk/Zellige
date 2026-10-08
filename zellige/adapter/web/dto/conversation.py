from __future__ import annotations

from pydantic import model_validator

from zellige.adapter.web.dto.api_model import APIModel
from zellige.adapter.web.dto.branch import Branch
from zellige.domain.model.payload import NonEmptyString


class Conversation(APIModel):
    id: str
    title: str
    created_at: int
    updated_at: int
    deleted_at: int | None
    archived_at: int | None = None


class ConversationListResponse(APIModel):
    conversations: list[Conversation]
    has_more: bool


class CreateConversationRequest(APIModel):
    id: NonEmptyString | None = None
    branch_id: NonEmptyString | None = None
    title: NonEmptyString = "New conversation"
    branch_name: NonEmptyString = "main"


class CreateConversationResponse(APIModel):
    conversation: Conversation
    branch: Branch


class UpdateConversationRequest(APIModel):
    expected_updated_at: int
    title: NonEmptyString | None = None
    archived: bool | None = None

    @model_validator(mode="after")
    def require_change(self) -> UpdateConversationRequest:
        if self.title is None and self.archived is None:
            raise ValueError("title or archived is required")
        if self.title is not None:
            self.title = self.title.strip()
            if not self.title:
                raise ValueError("title must not be blank")
        return self
