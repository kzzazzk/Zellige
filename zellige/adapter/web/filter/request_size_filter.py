from collections.abc import Awaitable, Callable

from fastapi import Request
from fastapi.responses import JSONResponse, Response

from zellige.adapter.web.controller.responses import JSON_BODY_LIMIT


class RequestSizeFilter:
    """Reject oversized JSON bodies by Content-Length; artifact uploads have their own limit."""

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        content_length = request.headers.get("content-length")
        if content_length and request.url.path != "/v1/artifacts":
            try:
                too_large = int(content_length) > JSON_BODY_LIMIT
            except ValueError:
                return JSONResponse(
                    status_code=400,
                    content={
                        "error": {
                            "code": "invalid_length",
                            "message": "invalid Content-Length",
                        }
                    },
                )
            if too_large:
                return JSONResponse(
                    status_code=413,
                    content={
                        "error": {
                            "code": "body_too_large",
                            "message": "JSON body is too large",
                        }
                    },
                )
        return await call_next(request)
