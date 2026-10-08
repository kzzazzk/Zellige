"""Rows to entities, one explicit function per table, like a Spring RowMapper."""

import sqlite3

from zellige.adapter.persistence.sqlite.codec import from_json
from zellige.application.port.persistence.change_repository import Change
from zellige.domain.model.artifact import Artifact
from zellige.domain.model.branch import Branch
from zellige.domain.model.conversation import Conversation
from zellige.domain.model.item import Item
from zellige.domain.model.run import Run
from zellige.domain.model.runtime_profile import RuntimeProfile, RuntimeProfileVersion


def conversation_from_row(row: sqlite3.Row) -> Conversation:
    return Conversation(
        id=row["id"],
        title=row["title"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        deleted_at=row["deleted_at"],
        archived_at=row["archived_at"],
    )


def branch_from_row(row: sqlite3.Row) -> Branch:
    return Branch(
        id=row["id"],
        conversation_id=row["conversation_id"],
        name=row["name"],
        head_item_id=row["head_item_id"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def item_from_row(row: sqlite3.Row) -> Item:
    return Item(
        id=row["id"],
        conversation_id=row["conversation_id"],
        parent_item_id=row["parent_item_id"],
        run_id=row["run_id"],
        kind=row["kind"],
        payload_schema_version=row["payload_schema_version"],
        payload=from_json(row["payload_json"]),
        created_at=row["created_at"],
    )


def run_from_row(row: sqlite3.Row) -> Run:
    return Run(
        id=row["id"],
        conversation_id=row["conversation_id"],
        branch_id=row["branch_id"],
        input_head_item_id=row["input_head_item_id"],
        runtime_profile_version_id=row["runtime_profile_version_id"],
        provider_session_id=row["provider_session_id"],
        status=row["status"],
        request=from_json(row["request_json"]),
        result=from_json(row["result_json"]),
        created_at=row["created_at"],
        started_at=row["started_at"],
        completed_at=row["completed_at"],
    )


def runtime_profile_from_row(row: sqlite3.Row) -> RuntimeProfile:
    return RuntimeProfile(
        id=row["id"],
        name=row["name"],
        description=row["description"],
        created_at=row["created_at"],
    )


def runtime_profile_version_from_row(row: sqlite3.Row) -> RuntimeProfileVersion:
    return RuntimeProfileVersion(
        id=row["id"],
        runtime_profile_id=row["runtime_profile_id"],
        version=row["version"],
        definition=from_json(row["definition_json"]),
        created_at=row["created_at"],
    )


def artifact_from_row(row: sqlite3.Row) -> Artifact:
    return Artifact(
        id=row["id"],
        sha256=row["sha256"],
        size_bytes=row["size_bytes"],
        media_type=row["media_type"],
        storage_key=row["storage_key"],
        created_at=row["created_at"],
    )


def change_from_row(row: sqlite3.Row) -> Change:
    return Change(
        seq=row["seq"],
        conversation_id=row["conversation_id"],
        entity_type=row["entity_type"],
        entity_id=row["entity_id"],
        operation=row["operation"],
        data=from_json(row["data_json"]),
        changed_at=row["changed_at"],
    )
