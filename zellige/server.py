import argparse
import hmac
import os
from pathlib import Path
from typing import Annotated, Any

import uvicorn
from fastapi import APIRouter, Body, Depends, FastAPI, Header, Query, Request, Security
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .api_models import (
    AppendItemRequest,
    Artifact,
    Branch,
    BranchListResponse,
    BranchHistoryResponse,
    Conversation,
    ConversationListResponse,
    ChangesResponse,
    ContextPackVersion,
    CreateBranchRequest,
    CreateContextPackRequest,
    CreateContextPackResponse,
    CreateContextPackVersionRequest,
    CreateConversationRequest,
    CreateConversationResponse,
    CreateRunRequest,
    CreateRuntimeProfileRequest,
    CreateRuntimeProfileResponse,
    ErrorResponse,
    HealthResponse,
    Item,
    Run,
    RunListResponse,
    RuntimeProfileListResponse,
    UpdateConversationRequest,
)
from .adapters.files import FileBlobStore
from .adapters.sqlite import Database, SQLiteStore, now_us
from .application.zellige import Zellige
from .domain.errors import DomainError


JSON_BODY_LIMIT = 2 * 1024 * 1024
ARTIFACT_BODY_LIMIT = 100 * 1024 * 1024
# How each kind of domain failure is expressed over HTTP; the core knows nothing of status codes.
STATUS = {"invalid": 400, "not_found": 404, "conflict": 409, "internal": 500}


class HTTPError(Exception):
    """Failures that only exist at the HTTP edge: authentication and body limits."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def error_response(description: str, code: str, message: str) -> dict[str, Any]:
    return {
        "model": ErrorResponse,
        "description": description,
        "content": {
            "application/json": {"example": {"error": {"code": code, "message": message}}}
        },
    }


BAD_REQUEST = error_response(
    "The request or payload is invalid.", "invalid_request", "request validation failed"
)
UNAUTHORIZED = error_response(
    "A valid bearer token is required.", "unauthorized", "a valid bearer token is required"
)
NOT_FOUND = error_response(
    "The requested canonical object does not exist.", "not_found", "object not found"
)
CONFLICT = error_response(
    "The write conflicts with current canonical state.", "head_conflict", "branch head has changed"
)
TOO_LARGE = error_response(
    "The request body exceeds the configured limit.", "body_too_large", "request body is too large"
)
LENGTH_REQUIRED = error_response(
    "Content-Length is required.", "length_required", "Content-Length is required"
)

ERRORS = {400: BAD_REQUEST, 401: UNAUTHORIZED, 404: NOT_FOUND, 409: CONFLICT,
          411: LENGTH_REQUIRED, 413: TOO_LARGE}

bearer = HTTPBearer(
    auto_error=False,
    scheme_name="BearerAuth",
    description="Server API token configured through ZELLIGE_API_TOKEN.",
)


def _authorize(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Security(bearer)],
) -> None:
    token = request.app.state.token
    if (
        credentials is None
        or credentials.scheme.lower() != "bearer"
        or not hmac.compare_digest(credentials.credentials, token)
    ):
        raise HTTPError(401, "unauthorized", "a valid bearer token is required")


def create_app(zellige: Zellige, token: str) -> FastAPI:
    if not token:
        raise ValueError("ZELLIGE_API_TOKEN must not be empty")

    app = FastAPI(
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
            {"name": "conversations", "description": "Canonical conversations, branches, and items."},
            {"name": "execution", "description": "Versioned profiles, context packs, and runs."},
            {"name": "sync", "description": "Incremental synchronization from a monotonic cursor."},
            {"name": "artifacts", "description": "Content-addressed binary storage."},
        ],
    )
    app.state.zellige = zellige
    app.state.token = token

    @app.exception_handler(DomainError)
    async def domain_error_handler(_request: Request, error: DomainError) -> JSONResponse:
        detail: dict[str, Any] = {"code": error.code, "message": error.message}
        if error.details is not None:
            detail["details"] = error.details
        return JSONResponse(status_code=STATUS[error.kind], content={"error": detail})

    @app.exception_handler(HTTPError)
    async def http_error_handler(_request: Request, error: HTTPError) -> JSONResponse:
        return JSONResponse(status_code=error.status, content={"error": {"code": error.code, "message": error.message}})

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        _request: Request, error: RequestValidationError
    ) -> JSONResponse:
        details = [
            {"location": list(item["loc"]), "message": item["msg"], "type": item["type"]}
            for item in error.errors()
        ]
        code = (
            "invalid_payload"
            if any("payload" in item["loc"] for item in error.errors())
            else "invalid_request"
        )
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": code,
                    "message": "request validation failed",
                    "details": details,
                }
            },
        )

    @app.middleware("http")
    async def reject_oversized_json(request: Request, call_next: Any):
        content_length = request.headers.get("content-length")
        if content_length and request.url.path != "/v1/artifacts":
            try:
                too_large = int(content_length) > JSON_BODY_LIMIT
            except ValueError:
                return JSONResponse(
                    status_code=400,
                    content={
                        "error": {"code": "invalid_length", "message": "invalid Content-Length"}
                    },
                )
            if too_large:
                return JSONResponse(
                    status_code=413,
                    content={
                        "error": {"code": "body_too_large", "message": "JSON body is too large"}
                    },
                )
        return await call_next(request)

    z = zellige

    def data(body: Any) -> dict[str, Any]:
        return body.model_dump(mode="json", exclude_none=True)

    def errors(*statuses: int) -> dict[int | str, dict[str, Any]]:
        return {status: ERRORS[status] for status in statuses}

    @app.get("/health", response_model=HealthResponse, operation_id="getHealth", tags=["system"],
             summary="Check daemon and database health")
    def health() -> dict[str, Any]:
        return z.health()

    # Every /v1 route requires the bearer token (and documents its 401).
    v1 = APIRouter(prefix="/v1", dependencies=[Depends(_authorize)], responses=errors(401))

    # --- Conversations, branches and items -----------------------------------
    @v1.get("/conversations", response_model=ConversationListResponse, operation_id="listConversations",
            tags=["conversations"], summary="List active or archived conversations, ordered by recent activity")
    def list_conversations(archived: bool = False, query: str = "",
                           limit: Annotated[int, Query(ge=1, le=200)] = 50,
                           offset: Annotated[int, Query(ge=0)] = 0) -> dict[str, Any]:
        return z.list_conversations(archived, query, limit, offset)

    @v1.post("/conversations", response_model=CreateConversationResponse, status_code=201,
             operation_id="createConversation", tags=["conversations"],
             summary="Create a conversation and its initial branch", responses=errors(400, 409, 413))
    def create_conversation(body: CreateConversationRequest) -> dict[str, Any]:
        return z.create_conversation(data(body))

    @v1.get("/conversations/{conversation_id}", response_model=Conversation, operation_id="getConversation",
            tags=["conversations"], responses=errors(404))
    def get_conversation(conversation_id: str) -> dict[str, Any]:
        return z.get_conversation(conversation_id)

    @v1.patch("/conversations/{conversation_id}", response_model=Conversation, operation_id="updateConversation",
              tags=["conversations"], responses=errors(400, 404, 409),
              summary="Rename, archive, or restore a conversation with optimistic metadata checking")
    def update_conversation(conversation_id: str, body: UpdateConversationRequest) -> dict[str, Any]:
        return z.update_conversation(conversation_id, body.model_dump(exclude_none=True))

    @v1.get("/conversations/{conversation_id}/branches", response_model=BranchListResponse,
            operation_id="listBranches", tags=["conversations"], responses=errors(404))
    def list_branches(conversation_id: str) -> dict[str, Any]:
        return z.list_branches(conversation_id)

    @v1.post("/conversations/{conversation_id}/branches", response_model=Branch, status_code=201,
             operation_id="createBranch", tags=["conversations"], responses=errors(400, 409, 413),
             summary="Create a branch at an item in the same conversation")
    def create_branch(conversation_id: str, body: CreateBranchRequest) -> dict[str, Any]:
        return z.create_branch(conversation_id, data(body))

    @v1.post("/conversations/{conversation_id}/branches/{branch_id}/items", response_model=Item, status_code=201,
             operation_id="appendItem", tags=["conversations"], responses=errors(400, 404, 409, 413),
             summary="Append an immutable item with optimistic head checking",
             description="The item parent is the supplied expected head. A stale head returns HTTP 409; "
                         "the server never silently rebases an item.")
    def append_item(conversation_id: str, branch_id: str, body: AppendItemRequest) -> dict[str, Any]:
        return z.append_item(conversation_id, branch_id, data(body))

    @v1.get("/conversations/{conversation_id}/branches/{branch_id}/history", response_model=BranchHistoryResponse,
            operation_id="getBranchHistory", tags=["conversations"], responses=errors(404),
            summary="Reconstruct branch history from its current head")
    def branch_history(conversation_id: str, branch_id: str) -> dict[str, Any]:
        return z.history(conversation_id, branch_id)

    # --- Execution -----------------------------------------------------------------
    @v1.get("/runtime-profiles", response_model=RuntimeProfileListResponse, operation_id="listRuntimeProfiles",
            tags=["execution"], summary="List execution profiles with their latest immutable version")
    def list_runtime_profiles() -> dict[str, Any]:
        return z.list_runtime_profiles()

    @v1.post("/runtime-profiles", response_model=CreateRuntimeProfileResponse, status_code=201,
             operation_id="createRuntimeProfile", tags=["execution"], responses=errors(400, 409, 413),
             summary="Create a runtime profile with immutable version 1")
    def create_runtime_profile(body: CreateRuntimeProfileRequest) -> dict[str, Any]:
        return z.create_runtime_profile(data(body))

    @v1.post("/context-packs", response_model=CreateContextPackResponse, status_code=201,
             operation_id="createContextPack", tags=["execution"], responses=errors(400, 409, 413),
             summary="Create a context pack with immutable version 1")
    def create_context_pack(body: CreateContextPackRequest) -> dict[str, Any]:
        return z.create_context_pack(data(body))

    @v1.post("/context-packs/{context_pack_id}/versions", response_model=ContextPackVersion, status_code=201,
             operation_id="createContextPackVersion", tags=["execution"], responses=errors(400, 404, 409, 413),
             summary="Add an immutable context pack version")
    def create_context_pack_version(context_pack_id: str, body: CreateContextPackVersionRequest) -> dict[str, Any]:
        return z.add_context_pack_version(context_pack_id, data(body))

    @v1.get("/conversations/{conversation_id}/runs", response_model=RunListResponse,
            operation_id="listConversationRuns", tags=["execution"], responses=errors(404),
            summary="Read the 50 most recent runs of a conversation")
    def list_runs(conversation_id: str) -> dict[str, Any]:
        return z.list_runs(conversation_id)

    @v1.post("/runs", response_model=Run, status_code=201, operation_id="createRun", tags=["execution"],
             summary="Create a queued run using exact profile and context versions", responses=errors(400, 409, 413))
    def create_run(body: CreateRunRequest) -> dict[str, Any]:
        return z.create_run(data(body))

    # --- Sync and artifacts --------------------------------------------------------
    @v1.get("/changes", response_model=ChangesResponse, operation_id="getChanges", tags=["sync"],
            summary="Read canonical changes after a monotonic cursor", responses=errors(400))
    def get_changes(cursor: Annotated[int, Query(ge=0, description="Last fully applied change sequence.")] = 0,
                    limit: Annotated[int, Query(ge=1, le=1000)] = 100) -> dict[str, Any]:
        return z.changes(cursor, limit)

    @v1.post("/artifacts", response_model=Artifact, status_code=201, operation_id="putArtifact", tags=["artifacts"],
             summary="Store binary content by SHA-256", responses=errors(400, 411, 413),
             description="The response is idempotent for identical bytes. The upload limit is 100 MiB.")
    def put_artifact(
        content: Annotated[bytes, Body(media_type="application/octet-stream",
                                       description="Raw artifact bytes. Use the actual media type in Content-Type.")],
        content_length: Annotated[int | None, Header(alias="Content-Length")] = None,
        content_type: Annotated[str | None, Header(alias="Content-Type")] = None,
    ) -> dict[str, Any]:
        if content_length is None:
            raise HTTPError(411, "length_required", "Content-Length is required")
        if content_length > ARTIFACT_BODY_LIMIT or len(content) > ARTIFACT_BODY_LIMIT:
            raise HTTPError(413, "body_too_large", "artifact is too large")
        return z.put_artifact(content, content_type or "application/octet-stream")

    app.include_router(v1)

    generated_openapi = app.openapi

    def openapi_schema() -> dict[str, Any]:
        if app.openapi_schema is not None:
            return app.openapi_schema
        schema = generated_openapi()
        for path in schema["paths"].values():
            for operation in path.values():
                if isinstance(operation, dict) and "responses" in operation:
                    operation["responses"].pop("422", None)
        schema.get("components", {}).get("schemas", {}).pop("HTTPValidationError", None)
        schema.get("components", {}).get("schemas", {}).pop("ValidationError", None)
        app.openapi_schema = schema
        return schema

    app.openapi = openapi_schema
    return app


def build_app(data_dir: Path, token: str, web_dir: Path | None = None) -> FastAPI:
    project_root = Path(__file__).resolve().parents[1]
    packaged_migrations = Path(__file__).resolve().parent / "migrations"
    migrations_dir = (
        packaged_migrations
        if packaged_migrations.is_dir()
        else project_root / "migrations"
    )
    # Composition root: the core, wired to SQLite and the local file system.
    database = Database(data_dir / "zellige.sqlite3", migrations_dir)
    app = create_app(Zellige(SQLiteStore(database), FileBlobStore(data_dir / "blobs"), now_us), token)
    app.state.database = database
    assets = web_dir if web_dir is not None else project_root / "web" / "dist"
    if (assets / "index.html").is_file():
        app.mount("/", StaticFiles(directory=assets, html=True), name="web")
    return app


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Zellige conversation daemon")
    parser.add_argument("--host", default=os.environ.get("ZELLIGE_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("ZELLIGE_PORT", "8787")))
    parser.add_argument("--data-dir", type=Path, default=Path(os.environ.get("ZELLIGE_DATA_DIR", "./data")))
    parser.add_argument("--web-dir", type=Path, default=os.environ.get("ZELLIGE_WEB_DIR"))
    args = parser.parse_args()
    token = os.environ.get("ZELLIGE_API_TOKEN", "")
    app = build_app(args.data_dir, token, args.web_dir)
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        access_log=os.environ.get("ZELLIGE_HTTP_LOG") == "1",
    )


if __name__ == "__main__":
    main()
