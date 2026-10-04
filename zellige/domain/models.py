"""Canonical records exchanged through repository ports; no HTTP or ORM models."""
from typing import Any, TypedDict

Record = dict[str, Any]


class Conversation(TypedDict):
    id: str
    title: str
    created_at: int
    updated_at: int
    deleted_at: int | None
    archived_at: int | None


class Branch(TypedDict):
    id: str
    conversation_id: str
    name: str
    head_item_id: str | None
    created_at: int
    updated_at: int


class Item(TypedDict):
    id: str
    conversation_id: str
    parent_item_id: str | None
    run_id: str | None
    kind: str
    payload_schema_version: int
    payload: Record
    created_at: int


class Run(TypedDict):
    id: str
    conversation_id: str
    branch_id: str
    input_head_item_id: str | None
    runtime_profile_version_id: str
    provider_session_id: str | None
    status: str
    request: Record
    result: Record | None
    created_at: int
    started_at: int | None
    completed_at: int | None
    context_pack_version_ids: list[str]
