from typing import Any

from fastapi import APIRouter, Depends, FastAPI
from starlette.middleware.base import BaseHTTPMiddleware

from zellige.adapter.web.controller.artifact_controller import (
    ArtifactController,
)
from zellige.adapter.web.controller.branch_controller import BranchController
from zellige.adapter.web.controller.changes_controller import ChangesController
from zellige.adapter.web.controller.conversation_controller import (
    ConversationController,
)
from zellige.adapter.web.controller.health_controller import HealthController
from zellige.adapter.web.controller.http_controller import HTTPController
from zellige.adapter.web.controller.responses import errors
from zellige.adapter.web.controller.run_controller import RunController
from zellige.adapter.web.controller.runtime_profile_controller import (
    RuntimeProfileController,
)
from zellige.adapter.web.exception.global_exception_handler import (
    GlobalExceptionHandler,
)
from zellige.adapter.web.filter.request_size_filter import RequestSizeFilter
from zellige.adapter.web.security.bearer_authentication import (
    BearerAuthentication,
)
from zellige.application.usecase.zellige import Zellige


class HTTPApplication:
    def __init__(self, application: Zellige, token: str) -> None:
        self.authentication = BearerAuthentication(token)
        self.application = application
        self.app = FastAPI(
            title="Zellige API",
            summary="Provider-neutral conversation and execution API.",
            description=(
                "The Zellige daemon is the sole owner of the canonical SQLite database. "
                "Clients use this API to create conversations, append immutable items, "
                "start runs, and synchronize through the changes cursor."
            ),
            version="0.1.0",
            openapi_version="3.1.0",
            docs_url="/docs",
            redoc_url="/redoc",
            swagger_ui_parameters={"persistAuthorization": True},
            openapi_tags=[
                {"name": "system", "description": "Daemon health and diagnostics."},
                {
                    "name": "conversations",
                    "description": "Canonical conversations, branches, and items.",
                },
                {
                    "name": "execution",
                    "description": "Versioned runtime profiles and runs.",
                },
                {
                    "name": "sync",
                    "description": "Incremental synchronization from a monotonic cursor.",
                },
                {
                    "name": "artifacts",
                    "description": "Content-addressed binary storage.",
                },
            ],
        )
        self._generated_openapi = self.app.openapi

    def build(self) -> FastAPI:
        GlobalExceptionHandler().register(self.app)
        self.app.add_middleware(
            BaseHTTPMiddleware, dispatch=RequestSizeFilter().dispatch
        )
        self.app.include_router(HealthController(self.application.system).router)
        v1 = APIRouter(
            prefix="/v1",
            dependencies=[Depends(self.authentication.authorize)],
            responses=errors(401),
        )
        controllers: list[HTTPController] = [
            ConversationController(self.application.conversations),
            BranchController(self.application.branches),
            RuntimeProfileController(self.application.profiles),
            RunController(self.application.runs),
            ChangesController(self.application.synchronization),
            ArtifactController(self.application.artifacts),
        ]
        for controller in controllers:
            v1.include_router(controller.router)
        self.app.include_router(v1)
        self.app.openapi = self.openapi_schema  # type: ignore[method-assign]
        return self.app

    def openapi_schema(self) -> dict[str, Any]:
        if self.app.openapi_schema is not None:
            return self.app.openapi_schema
        schema = self._generated_openapi()
        for path in schema["paths"].values():
            for operation in path.values():
                if isinstance(operation, dict) and "responses" in operation:
                    operation["responses"].pop("422", None)
        schema.get("components", {}).get("schemas", {}).pop("HTTPValidationError", None)
        schema.get("components", {}).get("schemas", {}).pop("ValidationError", None)
        self.app.openapi_schema = schema
        return schema
