from dataclasses import dataclass
from typing import Annotated

from fastapi import Query

from zellige.adapter.web.controller.http_controller import HTTPController
from zellige.adapter.web.controller.responses import errors
from zellige.adapter.web.dto.run import CreateRunRequest, Run, RunListResponse
from zellige.application.usecase.run import CreateRun, RunList, RunUseCase
from zellige.domain import model


@dataclass
class RunController(HTTPController):
    use_case: RunUseCase

    def __post_init__(self) -> None:
        self.router.add_api_route(
            "/conversations/{conversation_id}/runs",
            self.list_runs,
            methods=["GET"],
            response_model=RunListResponse,
            operation_id="listConversationRuns",
            tags=["execution"],
            responses=errors(404),
            summary="Read the most recent runs of a conversation, newest first",
        )
        self.router.add_api_route(
            "/runs",
            self.create_run,
            methods=["POST"],
            response_model=Run,
            status_code=201,
            operation_id="createRun",
            tags=["execution"],
            summary="Create a queued run using an exact runtime profile version",
            responses=errors(400, 409, 413),
        )

    def list_runs(
        self,
        conversation_id: str,
        limit: Annotated[int, Query(ge=1, le=200)] = 50,
        offset: Annotated[int, Query(ge=0)] = 0,
    ) -> RunList:
        return self.use_case.list(conversation_id, limit, offset)

    def create_run(self, body: CreateRunRequest) -> model.Run:
        return self.use_case.create(
            CreateRun(
                id=body.id,
                conversation_id=body.conversation_id,
                branch_id=body.branch_id,
                runtime_profile_version_id=body.runtime_profile_version_id,
                provider_session_id=body.provider_session_id,
                request=body.request,
            )
        )
