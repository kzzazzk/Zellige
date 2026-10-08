from dataclasses import dataclass

from zellige.adapter.web.controller.http_controller import HTTPController
from zellige.adapter.web.controller.responses import errors
from zellige.adapter.web.dto.branch import (
    Branch,
    BranchHistoryResponse,
    BranchListResponse,
    CreateBranchRequest,
)
from zellige.adapter.web.dto.item import AppendItemRequest, Item
from zellige.application.usecase.branch import (
    AppendItem,
    BranchHistory,
    BranchList,
    BranchUseCase,
    CreateBranch,
)
from zellige.domain import model


@dataclass
class BranchController(HTTPController):
    use_case: BranchUseCase

    def __post_init__(self) -> None:
        self.router.add_api_route(
            "/conversations/{conversation_id}/branches",
            self.list_branches,
            methods=["GET"],
            response_model=BranchListResponse,
            operation_id="listBranches",
            tags=["conversations"],
            responses=errors(404),
        )
        self.router.add_api_route(
            "/conversations/{conversation_id}/branches",
            self.create_branch,
            methods=["POST"],
            response_model=Branch,
            status_code=201,
            operation_id="createBranch",
            tags=["conversations"],
            responses=errors(400, 409, 413),
            summary="Create a branch at an item in the same conversation",
        )
        self.router.add_api_route(
            "/conversations/{conversation_id}/branches/{branch_id}/items",
            self.append_item,
            methods=["POST"],
            response_model=Item,
            status_code=201,
            operation_id="appendItem",
            tags=["conversations"],
            responses=errors(400, 404, 409, 413),
            summary="Append an immutable item with optimistic head checking",
            description="The item parent is the supplied expected head. A stale head returns HTTP 409; "
            "the server never silently rebases an item.",
        )
        self.router.add_api_route(
            "/conversations/{conversation_id}/branches/{branch_id}/history",
            self.branch_history,
            methods=["GET"],
            response_model=BranchHistoryResponse,
            operation_id="getBranchHistory",
            tags=["conversations"],
            responses=errors(404),
            summary="Reconstruct branch history from its current head",
        )

    def list_branches(self, conversation_id: str) -> BranchList:
        return self.use_case.list(conversation_id)

    def create_branch(
        self, conversation_id: str, body: CreateBranchRequest
    ) -> model.Branch:
        return self.use_case.create(
            conversation_id,
            CreateBranch(
                id=body.id,
                name=body.name,
                head_item_id=body.head_item_id,
            ),
        )

    def append_item(
        self, conversation_id: str, branch_id: str, body: AppendItemRequest
    ) -> model.Item:
        return self.use_case.append(
            conversation_id,
            branch_id,
            AppendItem(
                id=body.id,
                expected_head_item_id=body.expected_head_item_id,
                run_id=body.run_id,
                kind=body.kind,
                payload_schema_version=body.payload_schema_version,
                payload=body.payload.model_dump(mode="json", exclude_none=True),
            ),
        )

    def branch_history(self, conversation_id: str, branch_id: str) -> BranchHistory:
        return self.use_case.history(conversation_id, branch_id)
