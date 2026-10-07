from dataclasses import dataclass

from zellige.adapter.web.controller.http_controller import HTTPController
from zellige.adapter.web.dto.health import HealthResponse
from zellige.application.usecase.system import Health, SystemUseCase


@dataclass
class HealthController(HTTPController):
    use_case: SystemUseCase

    def __post_init__(self) -> None:
        self.router.add_api_route(
            "/health",
            self.health,
            methods=["GET"],
            response_model=HealthResponse,
            operation_id="getHealth",
            tags=["system"],
            summary="Check daemon and database health",
        )

    def health(self) -> Health:
        return self.use_case.health()
