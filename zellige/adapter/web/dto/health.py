from __future__ import annotations

from typing import Literal

from zellige.adapter.web.dto.api_model import APIModel


class HealthResponse(APIModel):
    status: Literal["ok"]
    database: str
