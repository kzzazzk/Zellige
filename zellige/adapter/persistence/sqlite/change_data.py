"""The `data` of each change-feed record: a public sync contract, kept explicit.

Renaming an entity field must not silently change what clients receive, so each
entity type lists its published fields here.
"""

from zellige.domain.model.artifact import Artifact
from zellige.domain.model.branch import Branch
from zellige.domain.model.conversation import Conversation
from zellige.domain.model.item import Item
from zellige.domain.model.run import Run
from zellige.domain.model.runtime_profile import RuntimeProfile, RuntimeProfileVersion
from zellige.domain.model.types import JsonObject


def conversation_data(conversation: Conversation) -> JsonObject:
    return {
        "id": conversation.id,
        "title": conversation.title,
        "created_at": conversation.created_at,
        "updated_at": conversation.updated_at,
        "deleted_at": conversation.deleted_at,
        "archived_at": conversation.archived_at,
    }


def branch_data(branch: Branch) -> JsonObject:
    return {
        "id": branch.id,
        "conversation_id": branch.conversation_id,
        "name": branch.name,
        "head_item_id": branch.head_item_id,
        "created_at": branch.created_at,
        "updated_at": branch.updated_at,
    }


def item_data(item: Item) -> JsonObject:
    return {
        "id": item.id,
        "conversation_id": item.conversation_id,
        "parent_item_id": item.parent_item_id,
        "run_id": item.run_id,
        "kind": item.kind,
        "payload_schema_version": item.payload_schema_version,
        "payload": item.payload,
        "created_at": item.created_at,
    }


def run_data(run: Run) -> JsonObject:
    return {
        "id": run.id,
        "conversation_id": run.conversation_id,
        "branch_id": run.branch_id,
        "input_head_item_id": run.input_head_item_id,
        "runtime_profile_version_id": run.runtime_profile_version_id,
        "provider_session_id": run.provider_session_id,
        "status": run.status,
        "request": run.request,
        "result": run.result,
        "created_at": run.created_at,
        "started_at": run.started_at,
        "completed_at": run.completed_at,
    }


def runtime_profile_data(profile: RuntimeProfile) -> JsonObject:
    return {
        "id": profile.id,
        "name": profile.name,
        "description": profile.description,
        "created_at": profile.created_at,
    }


def runtime_profile_version_data(version: RuntimeProfileVersion) -> JsonObject:
    return {
        "id": version.id,
        "runtime_profile_id": version.runtime_profile_id,
        "version": version.version,
        "definition": version.definition,
        "created_at": version.created_at,
    }


def artifact_data(artifact: Artifact) -> JsonObject:
    return {
        "id": artifact.id,
        "sha256": artifact.sha256,
        "size_bytes": artifact.size_bytes,
        "media_type": artifact.media_type,
        "storage_key": artifact.storage_key,
        "created_at": artifact.created_at,
    }
