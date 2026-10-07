from typing import Any

from zellige.adapter.web.dto.error import ErrorResponse

JSON_BODY_LIMIT = 2 * 1024 * 1024


ARTIFACT_BODY_LIMIT = 100 * 1024 * 1024


def error_response(description: str, code: str, message: str) -> dict[str, Any]:
    return {
        "model": ErrorResponse,
        "description": description,
        "content": {
            "application/json": {
                "example": {"error": {"code": code, "message": message}}
            }
        },
    }


BAD_REQUEST = error_response(
    "The request or payload is invalid.", "invalid_request", "request validation failed"
)


UNAUTHORIZED = error_response(
    "A valid bearer token is required.",
    "unauthorized",
    "a valid bearer token is required",
)


NOT_FOUND = error_response(
    "The requested canonical object does not exist.", "not_found", "object not found"
)


CONFLICT = error_response(
    "The write conflicts with current canonical state.",
    "head_conflict",
    "branch head has changed",
)


TOO_LARGE = error_response(
    "The request body exceeds the configured limit.",
    "body_too_large",
    "request body is too large",
)


LENGTH_REQUIRED = error_response(
    "Content-Length is required.", "length_required", "Content-Length is required"
)


ERRORS = {
    400: BAD_REQUEST,
    401: UNAUTHORIZED,
    404: NOT_FOUND,
    409: CONFLICT,
    411: LENGTH_REQUIRED,
    413: TOO_LARGE,
}


def errors(*statuses: int) -> dict[int | str, dict[str, Any]]:
    return {status: ERRORS[status] for status in statuses}
