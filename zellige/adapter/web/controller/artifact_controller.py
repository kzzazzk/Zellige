from dataclasses import dataclass
from typing import Annotated

from fastapi import Body, Header

from zellige.adapter.web.controller.http_controller import HTTPController
from zellige.adapter.web.controller.responses import ARTIFACT_BODY_LIMIT, errors
from zellige.adapter.web.dto.artifact import Artifact
from zellige.adapter.web.exception.http_error import HTTPError
from zellige.application.usecase.artifact import ArtifactUseCase
from zellige.domain.model.artifact import Artifact as DomainArtifact


@dataclass
class ArtifactController(HTTPController):
    use_case: ArtifactUseCase

    def __post_init__(self) -> None:
        self.router.add_api_route(
            "/artifacts",
            self.put_artifact,
            methods=["POST"],
            response_model=Artifact,
            status_code=201,
            operation_id="putArtifact",
            tags=["artifacts"],
            summary="Store binary content by SHA-256",
            responses=errors(400, 411, 413),
            description="The response is idempotent for identical bytes. The upload limit is 100 MiB.",
        )

    def put_artifact(
        self,
        content: Annotated[
            bytes,
            Body(
                media_type="application/octet-stream",
                description="Raw artifact bytes. Use the actual media type in Content-Type.",
            ),
        ],
        content_length: Annotated[int | None, Header(alias="Content-Length")] = None,
        content_type: Annotated[str | None, Header(alias="Content-Type")] = None,
    ) -> DomainArtifact:
        if content_length is None:
            raise HTTPError(411, "length_required", "Content-Length is required")
        if content_length > ARTIFACT_BODY_LIMIT or len(content) > ARTIFACT_BODY_LIMIT:
            raise HTTPError(413, "body_too_large", "artifact is too large")
        return self.use_case.put(content, content_type or "application/octet-stream")
