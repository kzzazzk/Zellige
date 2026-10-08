from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from zellige.adapter.web.exception.http_error import HTTPError
from zellige.domain.exception.domain_error import DomainError

STATUS = {"invalid": 400, "not_found": 404, "conflict": 409, "internal": 500}


class GlobalExceptionHandler:
    """Render domain, HTTP and validation failures as the JSON error envelope."""

    def register(self, app: FastAPI) -> None:
        # exception_handler(Type) returns a decorator; calling it registers the
        # handler for that exception type and keeps the handler's typed signature.
        app.exception_handler(DomainError)(self.domain_error_handler)
        app.exception_handler(HTTPError)(self.http_error_handler)
        app.exception_handler(RequestValidationError)(self.validation_error_handler)

    async def domain_error_handler(
        self, _request: Request, error: DomainError
    ) -> JSONResponse:
        detail: dict[str, Any] = {"code": error.code, "message": error.message}
        if error.details is not None:
            detail["details"] = error.details
        return JSONResponse(status_code=STATUS[error.kind], content={"error": detail})

    async def http_error_handler(
        self, _request: Request, error: HTTPError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=error.status,
            content={"error": {"code": error.code, "message": error.message}},
        )

    async def validation_error_handler(
        self, _request: Request, error: RequestValidationError
    ) -> JSONResponse:
        details = [
            {
                "location": list(item["loc"]),
                "message": item["msg"],
                "type": item["type"],
            }
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
