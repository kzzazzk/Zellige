import hmac
from typing import Annotated

from fastapi import Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from zellige.adapter.web.exception.http_error import HTTPError

bearer = HTTPBearer(
    auto_error=False,
    scheme_name="BearerAuth",
    description="Server API token configured through ZELLIGE_API_TOKEN.",
)


class BearerAuthentication:
    def __init__(self, token: str) -> None:
        if not token:
            raise ValueError("ZELLIGE_API_TOKEN must not be empty")
        self.token = token

    def authorize(
        self,
        credentials: Annotated[HTTPAuthorizationCredentials | None, Security(bearer)],
    ) -> None:
        if (
            credentials is None
            or credentials.scheme.lower() != "bearer"
            or not hmac.compare_digest(credentials.credentials, self.token)
        ):
            raise HTTPError(401, "unauthorized", "a valid bearer token is required")
