from dataclasses import dataclass

from zellige.adapter.web.controller.http_controller import HTTPController
from zellige.adapter.web.controller.responses import errors
from zellige.adapter.web.dto.runtime_profile import (
    CreateRuntimeProfileRequest,
    CreateRuntimeProfileResponse,
    RuntimeProfileListResponse,
)
from zellige.application.usecase.runtime_profile import (
    CreateRuntimeProfile,
    RuntimeProfileList,
    RuntimeProfileUseCase,
)
from zellige.domain import model


@dataclass
class RuntimeProfileController(HTTPController):
    use_case: RuntimeProfileUseCase

    def __post_init__(self) -> None:
        self.router.add_api_route(
            "/runtime-profiles",
            self.list_runtime_profiles,
            methods=["GET"],
            response_model=RuntimeProfileListResponse,
            operation_id="listRuntimeProfiles",
            tags=["execution"],
            summary="List execution profiles with their latest immutable version",
        )
        self.router.add_api_route(
            "/runtime-profiles",
            self.create_runtime_profile,
            methods=["POST"],
            response_model=CreateRuntimeProfileResponse,
            status_code=201,
            operation_id="createRuntimeProfile",
            tags=["execution"],
            responses=errors(400, 409, 413),
            summary="Create a runtime profile with immutable version 1",
        )

    def list_runtime_profiles(self) -> RuntimeProfileList:
        return self.use_case.list()

    def create_runtime_profile(
        self, body: CreateRuntimeProfileRequest
    ) -> model.VersionedRuntimeProfile:
        return self.use_case.create(
            CreateRuntimeProfile(
                id=body.id,
                version_id=body.version_id,
                name=body.name,
                description=body.description,
                definition=body.definition,
            )
        )
