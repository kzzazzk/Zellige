from dataclasses import dataclass
from typing import Annotated

from fastapi import Query

from zellige.adapter.web.controller.http_controller import HTTPController
from zellige.adapter.web.controller.responses import errors
from zellige.adapter.web.dto.change import ChangesResponse
from zellige.application.usecase.synchronization import (
    ChangePage,
    SynchronizationUseCase,
)


@dataclass
class ChangesController(HTTPController):
    use_case: SynchronizationUseCase

    def __post_init__(self) -> None:
        self.router.add_api_route(
            "/changes",
            self.get_changes,
            methods=["GET"],
            response_model=ChangesResponse,
            operation_id="getChanges",
            tags=["sync"],
            summary="Read canonical changes after a monotonic cursor",
            responses=errors(400),
        )

    def get_changes(
        self,
        cursor: Annotated[
            int, Query(ge=0, description="Last fully applied change sequence.")
        ] = 0,
        limit: Annotated[int, Query(ge=1, le=1000)] = 100,
    ) -> ChangePage:
        return self.use_case.changes(cursor, limit)
