from __future__ import annotations

from zellige.adapter.web.dto.api_model import APIModel
from zellige.adapter.web.dto.item import Item
from zellige.domain.model.payload import NonEmptyString


class Branch(APIModel):
    id: str
    conversation_id: str
    name: str
    head_item_id: str | None
    created_at: int
    updated_at: int


class BranchListResponse(APIModel):
    branches: list[Branch]


class CreateBranchRequest(APIModel):
    id: NonEmptyString | None = None
    name: NonEmptyString
    head_item_id: str | None = None


class BranchHistoryResponse(APIModel):
    branch: Branch
    items: list[Item]
