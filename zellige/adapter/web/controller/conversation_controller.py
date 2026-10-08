from dataclasses import dataclass
from typing import Annotated

from fastapi import Query

from zellige.adapter.web.controller.http_controller import HTTPController
from zellige.adapter.web.controller.responses import errors
from zellige.adapter.web.dto.conversation import (
    Conversation,
    ConversationListResponse,
    CreateConversationRequest,
    CreateConversationResponse,
    UpdateConversationRequest,
)
from zellige.application.usecase.conversation import (
    ConversationPage,
    ConversationUseCase,
    CreateConversation,
    CreatedConversation,
    UpdateConversation,
)
from zellige.domain import model


@dataclass
class ConversationController(HTTPController):
    use_case: ConversationUseCase

    def __post_init__(self) -> None:
        self.router.add_api_route(
            "/conversations",
            self.list_conversations,
            methods=["GET"],
            response_model=ConversationListResponse,
            operation_id="listConversations",
            tags=["conversations"],
            summary="List active or archived conversations, ordered by recent activity",
        )
        self.router.add_api_route(
            "/conversations",
            self.create_conversation,
            methods=["POST"],
            response_model=CreateConversationResponse,
            status_code=201,
            operation_id="createConversation",
            tags=["conversations"],
            summary="Create a conversation and its initial branch",
            responses=errors(400, 409, 413),
        )
        self.router.add_api_route(
            "/conversations/{conversation_id}",
            self.get_conversation,
            methods=["GET"],
            response_model=Conversation,
            operation_id="getConversation",
            tags=["conversations"],
            responses=errors(404),
        )
        self.router.add_api_route(
            "/conversations/{conversation_id}",
            self.update_conversation,
            methods=["PATCH"],
            response_model=Conversation,
            operation_id="updateConversation",
            tags=["conversations"],
            responses=errors(400, 404, 409),
            summary="Rename, archive, or restore a conversation with optimistic metadata checking",
        )

    def list_conversations(
        self,
        archived: bool = False,
        query: str = "",
        limit: Annotated[int, Query(ge=1, le=200)] = 50,
        offset: Annotated[int, Query(ge=0)] = 0,
    ) -> ConversationPage:
        return self.use_case.list(archived, query, limit, offset)

    def create_conversation(
        self, body: CreateConversationRequest
    ) -> CreatedConversation:
        return self.use_case.create(
            CreateConversation(
                id=body.id,
                branch_id=body.branch_id,
                title=body.title,
                branch_name=body.branch_name,
            )
        )

    def get_conversation(self, conversation_id: str) -> model.Conversation:
        return self.use_case.get(conversation_id)

    def update_conversation(
        self, conversation_id: str, body: UpdateConversationRequest
    ) -> model.Conversation:
        return self.use_case.update(
            conversation_id,
            UpdateConversation(
                expected_updated_at=body.expected_updated_at,
                title=body.title,
                archived=body.archived,
            ),
        )
