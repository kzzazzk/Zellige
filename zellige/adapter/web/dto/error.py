from __future__ import annotations

from typing import Any

from zellige.adapter.web.dto.api_model import APIModel


class ErrorDetail(APIModel):
    code: str
    message: str
    details: Any | None = None


class ErrorResponse(APIModel):
    error: ErrorDetail
