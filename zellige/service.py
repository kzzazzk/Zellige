from __future__ import annotations

import contextlib
import json
import sqlite3
import uuid
from dataclasses import asdict
from pathlib import Path
from typing import Any

from .application.artifacts import StoreArtifact
from .database import Database, now_us
from .payloads import PayloadError, validate_payload


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _row(row: sqlite3.Row) -> dict[str, Any]:
    result = dict(row)
    for key in tuple(result):
        if key.endswith("_json"):
            value = result.pop(key)
            result[key.removesuffix("_json")] = json.loads(value) if value is not None else None
    return result


def _artifact_links(payload: dict[str, Any]) -> list[tuple[str, str, int]]:
    if payload["type"] in {"message", "tool_result"}:
        return [
            (block["artifact_id"], block["type"], ordinal)
            for ordinal, block in enumerate(payload["content"])
            if block["type"] != "text"
        ]
    if payload["type"] == "artifact":
        return [(payload["artifact_id"], "primary", 0)]
    return []


class ServiceError(Exception):
    def __init__(self, status: int, code: str, message: str, details: Any = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details


class ZelligeService:
    def __init__(
        self, database: Database, blob_dir: Path, *, artifacts: StoreArtifact | None = None
    ):
        self.database = database
        self.blob_dir = blob_dir
        if artifacts is None:
            # Compatibility for callers constructing the legacy facade directly.
            from .bootstrap import build_artifact_use_case

            artifacts = build_artifact_use_case(database, blob_dir)
        self.artifacts = artifacts

    @staticmethod
    def _change(
        connection: sqlite3.Connection,
        entity_type: str,
        entity_id: str,
        data: dict[str, Any],
        conversation_id: str | None = None,
    ) -> None:
        connection.execute(
            """INSERT INTO changes(
                   conversation_id, entity_type, entity_id, operation, data_json, changed_at
               ) VALUES (?, ?, ?, 'upsert', ?, ?)""",
            (conversation_id, entity_type, entity_id, _json(data), now_us()),
        )

    def create_conversation(self, body: dict[str, Any]) -> dict[str, Any]:
        conversation_id = body.get("id") or _id("conv")
        branch_id = body.get("branch_id") or _id("branch")
        title = body.get("title", "New conversation")
        branch_name = body.get("branch_name", "main")
        if not all(isinstance(value, str) and value for value in (conversation_id, branch_id, title, branch_name)):
            raise ServiceError(400, "invalid_request", "conversation fields must be non-empty strings")
        timestamp = now_us()
        try:
            with self.database.transaction(immediate=True) as connection:
                conversation = {
                    "id": conversation_id,
                    "title": title,
                    "created_at": timestamp,
                    "updated_at": timestamp,
                    "deleted_at": None,
                    "archived_at": None,
                }
                branch = {
                    "id": branch_id,
                    "conversation_id": conversation_id,
                    "name": branch_name,
                    "head_item_id": None,
                    "created_at": timestamp,
                    "updated_at": timestamp,
                }
                connection.execute(
                    """INSERT INTO conversations
                       (id, title, created_at, updated_at, deleted_at, archived_at)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    tuple(conversation.values()),
                )
                connection.execute(
                    "INSERT INTO branches VALUES (?, ?, ?, ?, ?, ?)",
                    tuple(branch.values()),
                )
                self._change(connection, "conversation", conversation_id, conversation, conversation_id)
                self._change(connection, "branch", branch_id, branch, conversation_id)
        except sqlite3.IntegrityError as error:
            raise ServiceError(409, "already_exists", "conversation or branch already exists") from error
        return {"conversation": conversation, "branch": branch}

    def list_conversations(
        self, archived: bool = False, query: str = "", limit: int = 50, offset: int = 0
    ) -> dict[str, Any]:
        with contextlib.closing(self.database.connect()) as connection:
            rows = connection.execute(
                """SELECT * FROM conversations
                   WHERE deleted_at IS NULL AND (archived_at IS NOT NULL) = ?
                     AND instr(lower(title), lower(?)) > 0
                   ORDER BY updated_at DESC, id ASC LIMIT ? OFFSET ?""",
                (archived, query, limit + 1, offset),
            ).fetchall()
        return {"conversations": [_row(row) for row in rows[:limit]], "has_more": len(rows) > limit}

    def get_conversation(self, conversation_id: str) -> dict[str, Any]:
        with contextlib.closing(self.database.connect()) as connection:
            row = connection.execute(
                "SELECT * FROM conversations WHERE id = ? AND deleted_at IS NULL",
                (conversation_id,),
            ).fetchone()
        if row is None:
            raise ServiceError(404, "conversation_not_found", "conversation not found")
        return _row(row)

    def update_conversation(self, conversation_id: str, body: dict[str, Any]) -> dict[str, Any]:
        with self.database.transaction(immediate=True) as connection:
            row = connection.execute(
                "SELECT * FROM conversations WHERE id = ? AND deleted_at IS NULL",
                (conversation_id,),
            ).fetchone()
            if row is None:
                raise ServiceError(404, "conversation_not_found", "conversation not found")
            conversation = _row(row)
            if conversation["updated_at"] != body["expected_updated_at"]:
                raise ServiceError(409, "conversation_conflict", "conversation changed; refresh before saving")
            if "title" in body:
                conversation["title"] = body["title"]
            timestamp = max(now_us(), conversation["updated_at"] + 1)
            if "archived" in body:
                conversation["archived_at"] = timestamp if body["archived"] else None
            conversation["updated_at"] = timestamp
            connection.execute(
                "UPDATE conversations SET title = ?, archived_at = ?, updated_at = ? WHERE id = ?",
                (conversation["title"], conversation["archived_at"], timestamp, conversation_id),
            )
            self._change(connection, "conversation", conversation_id, conversation, conversation_id)
        return conversation

    def list_branches(self, conversation_id: str) -> dict[str, Any]:
        self.get_conversation(conversation_id)
        with contextlib.closing(self.database.connect()) as connection:
            rows = connection.execute(
                "SELECT * FROM branches WHERE conversation_id = ? ORDER BY created_at, id",
                (conversation_id,),
            ).fetchall()
        return {"branches": [_row(row) for row in rows]}

    def list_runtime_profiles(self) -> dict[str, Any]:
        with contextlib.closing(self.database.connect()) as connection:
            profiles = []
            for row in connection.execute("SELECT * FROM runtime_profiles ORDER BY name, id"):
                version = connection.execute(
                    "SELECT * FROM runtime_profile_versions WHERE runtime_profile_id = ? ORDER BY version DESC LIMIT 1",
                    (row["id"],),
                ).fetchone()
                profiles.append({"runtime_profile": _row(row), "version": _row(version)})
        return {"profiles": profiles}

    def list_runs(self, conversation_id: str) -> dict[str, Any]:
        self.get_conversation(conversation_id)
        with contextlib.closing(self.database.connect()) as connection:
            runs = []
            for row in connection.execute(
                "SELECT * FROM runs WHERE conversation_id = ? ORDER BY created_at DESC, id LIMIT 50",
                (conversation_id,),
            ):
                run = _row(row)
                run["context_pack_version_ids"] = [entry[0] for entry in connection.execute(
                    "SELECT context_pack_version_id FROM run_context_packs WHERE run_id = ? ORDER BY ordinal",
                    (row["id"],),
                )]
                runs.append(run)
        return {"runs": runs}

    def create_branch(self, conversation_id: str, body: dict[str, Any]) -> dict[str, Any]:
        branch_id = body.get("id") or _id("branch")
        name = body.get("name")
        head_item_id = body.get("head_item_id")
        if not isinstance(name, str) or not name:
            raise ServiceError(400, "invalid_request", "name must be a non-empty string")
        timestamp = now_us()
        branch = {
            "id": branch_id,
            "conversation_id": conversation_id,
            "name": name,
            "head_item_id": head_item_id,
            "created_at": timestamp,
            "updated_at": timestamp,
        }
        try:
            with self.database.transaction(immediate=True) as connection:
                connection.execute(
                    "INSERT INTO branches VALUES (?, ?, ?, ?, ?, ?)", tuple(branch.values())
                )
                self._change(connection, "branch", branch_id, branch, conversation_id)
        except sqlite3.IntegrityError as error:
            raise ServiceError(409, "invalid_branch", "branch name, id, or head is invalid") from error
        return branch

    def append_item(self, conversation_id: str, branch_id: str, body: dict[str, Any]) -> dict[str, Any]:
        item_id = body.get("id") or _id("item")
        expected = body.get("expected_head_item_id")
        kind = body.get("kind")
        schema_version = body.get("payload_schema_version", 1)
        run_id = body.get("run_id")
        try:
            payload = validate_payload(kind, body.get("payload"), schema_version)
        except PayloadError as error:
            raise ServiceError(400, "invalid_payload", str(error)) from error

        timestamp = now_us()
        item = {
            "id": item_id,
            "conversation_id": conversation_id,
            "parent_item_id": expected,
            "run_id": run_id,
            "kind": kind,
            "payload_schema_version": schema_version,
            "payload": payload,
            "created_at": timestamp,
        }
        with self.database.transaction(immediate=True) as connection:
            branch = connection.execute(
                "SELECT head_item_id FROM branches WHERE id = ? AND conversation_id = ?",
                (branch_id, conversation_id),
            ).fetchone()
            if branch is None:
                raise ServiceError(404, "branch_not_found", "branch not found")
            actual = branch["head_item_id"]
            if actual != expected:
                raise ServiceError(
                    409,
                    "head_conflict",
                    "branch head has changed",
                    {"expected_head_item_id": expected, "actual_head_item_id": actual},
                )
            if run_id is not None:
                run = connection.execute(
                    "SELECT branch_id FROM runs WHERE id = ? AND conversation_id = ?",
                    (run_id, conversation_id),
                ).fetchone()
                if run is None or run["branch_id"] != branch_id:
                    raise ServiceError(
                        409,
                        "invalid_item",
                        "run must belong to the target conversation and branch",
                    )
            try:
                connection.execute(
                    """INSERT INTO items(
                           id, conversation_id, parent_item_id, run_id, kind,
                           payload_schema_version, payload_json, created_at
                       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (item_id, conversation_id, expected, run_id, kind, schema_version, _json(payload), timestamp),
                )
                connection.executemany(
                    "INSERT INTO item_artifacts(item_id, artifact_id, role, ordinal) VALUES (?, ?, ?, ?)",
                    [
                        (item_id, artifact_id, role, ordinal)
                        for artifact_id, role, ordinal in _artifact_links(payload)
                    ],
                )
                changed = connection.execute(
                    """UPDATE branches SET head_item_id = ?, updated_at = MAX(updated_at + 1, ?)
                       WHERE id = ? AND conversation_id = ?
                         AND head_item_id IS ?""",
                    (item_id, timestamp, branch_id, conversation_id, expected),
                ).rowcount
                if changed != 1:
                    raise ServiceError(409, "head_conflict", "branch head has changed")
                connection.execute(
                    "UPDATE conversations SET updated_at = MAX(updated_at + 1, ?) WHERE id = ?",
                    (timestamp, conversation_id),
                )
                stored_branch = _row(
                    connection.execute(
                        "SELECT * FROM branches WHERE id = ? AND conversation_id = ?",
                        (branch_id, conversation_id),
                    ).fetchone()
                )
                stored_conversation = _row(
                    connection.execute(
                        "SELECT * FROM conversations WHERE id = ?", (conversation_id,)
                    ).fetchone()
                )
                self._change(connection, "item", item_id, item, conversation_id)
                self._change(
                    connection,
                    "branch",
                    branch_id,
                    stored_branch,
                    conversation_id,
                )
                self._change(
                    connection,
                    "conversation",
                    conversation_id,
                    stored_conversation,
                    conversation_id,
                )
            except sqlite3.IntegrityError as error:
                raise ServiceError(409, "invalid_item", "item id, parent, or run is invalid") from error
        return item

    def history(self, conversation_id: str, branch_id: str) -> dict[str, Any]:
        with contextlib.closing(self.database.connect()) as connection:
            branch = connection.execute(
                "SELECT * FROM branches WHERE id = ? AND conversation_id = ?",
                (branch_id, conversation_id),
            ).fetchone()
            if branch is None:
                raise ServiceError(404, "branch_not_found", "branch not found")
            current = branch["head_item_id"]
            items: list[dict[str, Any]] = []
            seen: set[str] = set()
            while current is not None:
                if current in seen:
                    raise ServiceError(500, "history_cycle", "cycle detected in item ancestry")
                seen.add(current)
                row = connection.execute(
                    "SELECT * FROM items WHERE id = ? AND conversation_id = ?",
                    (current, conversation_id),
                ).fetchone()
                if row is None:
                    raise ServiceError(500, "broken_history", "branch ancestry is incomplete")
                items.append(_row(row))
                current = row["parent_item_id"]
        items.reverse()
        return {"branch": _row(branch), "items": items}

    def create_runtime_profile(self, body: dict[str, Any]) -> dict[str, Any]:
        profile_id = body.get("id") or _id("profile")
        version_id = body.get("version_id") or _id("profilev")
        name = body.get("name")
        definition = body.get("definition")
        if not isinstance(name, str) or not name or not isinstance(definition, dict):
            raise ServiceError(400, "invalid_request", "name and definition are required")
        timestamp = now_us()
        profile = {"id": profile_id, "name": name, "description": body.get("description"), "created_at": timestamp}
        version = {"id": version_id, "runtime_profile_id": profile_id, "version": 1, "definition": definition, "created_at": timestamp}
        try:
            with self.database.transaction(immediate=True) as connection:
                connection.execute("INSERT INTO runtime_profiles VALUES (?, ?, ?, ?)", tuple(profile.values()))
                connection.execute(
                    "INSERT INTO runtime_profile_versions VALUES (?, ?, ?, ?, ?)",
                    (version_id, profile_id, 1, _json(definition), timestamp),
                )
                self._change(connection, "runtime_profile", profile_id, profile)
                self._change(connection, "runtime_profile_version", version_id, version)
        except sqlite3.IntegrityError as error:
            raise ServiceError(409, "already_exists", "runtime profile already exists") from error
        return {"runtime_profile": profile, "version": version}

    def create_context_pack(self, body: dict[str, Any]) -> dict[str, Any]:
        pack_id = body.get("id") or _id("context")
        version_id = body.get("version_id") or _id("contextv")
        name = body.get("name")
        manifest = body.get("manifest")
        if not isinstance(name, str) or not name or not isinstance(manifest, dict):
            raise ServiceError(400, "invalid_request", "name and manifest are required")
        timestamp = now_us()
        pack = {"id": pack_id, "name": name, "description": body.get("description"), "created_at": timestamp}
        version = {"id": version_id, "context_pack_id": pack_id, "version": 1, "manifest": manifest, "created_at": timestamp}
        try:
            with self.database.transaction(immediate=True) as connection:
                connection.execute("INSERT INTO context_packs VALUES (?, ?, ?, ?)", tuple(pack.values()))
                connection.execute(
                    "INSERT INTO context_pack_versions VALUES (?, ?, ?, ?, ?)",
                    (version_id, pack_id, 1, _json(manifest), timestamp),
                )
                self._change(connection, "context_pack", pack_id, pack)
                self._change(connection, "context_pack_version", version_id, version)
        except sqlite3.IntegrityError as error:
            raise ServiceError(409, "already_exists", "context pack already exists") from error
        return {"context_pack": pack, "version": version}

    def add_context_pack_version(self, pack_id: str, body: dict[str, Any]) -> dict[str, Any]:
        manifest = body.get("manifest")
        if not isinstance(manifest, dict):
            raise ServiceError(400, "invalid_request", "manifest is required")
        version_id = body.get("id") or _id("contextv")
        timestamp = now_us()
        try:
            with self.database.transaction(immediate=True) as connection:
                current = connection.execute(
                    "SELECT COALESCE(MAX(version), 0) FROM context_pack_versions WHERE context_pack_id = ?",
                    (pack_id,),
                ).fetchone()[0]
                if current == 0:
                    raise ServiceError(404, "context_pack_not_found", "context pack not found")
                version = {"id": version_id, "context_pack_id": pack_id, "version": current + 1, "manifest": manifest, "created_at": timestamp}
                connection.execute(
                    "INSERT INTO context_pack_versions VALUES (?, ?, ?, ?, ?)",
                    (version_id, pack_id, current + 1, _json(manifest), timestamp),
                )
                self._change(connection, "context_pack_version", version_id, version)
        except sqlite3.IntegrityError as error:
            raise ServiceError(409, "already_exists", "context pack version already exists") from error
        return version

    def create_run(self, body: dict[str, Any]) -> dict[str, Any]:
        run_id = body.get("id") or _id("run")
        conversation_id = body.get("conversation_id")
        branch_id = body.get("branch_id")
        profile_version_id = body.get("runtime_profile_version_id")
        provider_session_id = body.get("provider_session_id")
        request = body.get("request", {})
        context_versions = body.get("context_pack_version_ids", [])
        if not all(isinstance(value, str) and value for value in (conversation_id, branch_id, profile_version_id)):
            raise ServiceError(400, "invalid_request", "conversation, branch and runtime profile version are required")
        if not isinstance(request, dict) or not isinstance(context_versions, list) or not all(isinstance(v, str) for v in context_versions):
            raise ServiceError(400, "invalid_request", "request or context pack versions are invalid")
        timestamp = now_us()
        try:
            with self.database.transaction(immediate=True) as connection:
                branch = connection.execute(
                    "SELECT head_item_id FROM branches WHERE id = ? AND conversation_id = ?",
                    (branch_id, conversation_id),
                ).fetchone()
                if branch is None:
                    raise ServiceError(
                        409, "invalid_run", "run conversation or branch is invalid"
                    )
                run = {
                    "id": run_id,
                    "conversation_id": conversation_id,
                    "branch_id": branch_id,
                    "input_head_item_id": branch["head_item_id"],
                    "runtime_profile_version_id": profile_version_id,
                    "provider_session_id": provider_session_id,
                    "status": "queued",
                    "request": request,
                    "result": None,
                    "created_at": timestamp,
                    "started_at": None,
                    "completed_at": None,
                    "context_pack_version_ids": context_versions,
                }
                connection.execute(
                    """INSERT INTO runs(
                           id, conversation_id, branch_id, input_head_item_id,
                           runtime_profile_version_id,
                           provider_session_id, status, request_json, result_json,
                           created_at, started_at, completed_at
                       ) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, NULL, ?, NULL, NULL)""",
                    (
                        run_id,
                        conversation_id,
                        branch_id,
                        branch["head_item_id"],
                        profile_version_id,
                        provider_session_id,
                        _json(request),
                        timestamp,
                    ),
                )
                connection.executemany(
                    "INSERT INTO run_context_packs(run_id, context_pack_version_id, ordinal) VALUES (?, ?, ?)",
                    [(run_id, version_id, ordinal) for ordinal, version_id in enumerate(context_versions)],
                )
                self._change(connection, "run", run_id, run, conversation_id)
        except sqlite3.IntegrityError as error:
            raise ServiceError(409, "invalid_run", "run references are invalid or duplicated") from error
        return run

    def changes(self, cursor: int, limit: int) -> dict[str, Any]:
        if cursor < 0 or limit < 1 or limit > 1_000:
            raise ServiceError(400, "invalid_cursor", "cursor must be non-negative and limit between 1 and 1000")
        with contextlib.closing(self.database.connect()) as connection:
            rows = connection.execute(
                "SELECT * FROM changes WHERE seq > ? ORDER BY seq LIMIT ?",
                (cursor, limit + 1),
            ).fetchall()
        has_more = len(rows) > limit
        selected = rows[:limit]
        changes = [_row(row) for row in selected]
        next_cursor = selected[-1]["seq"] if selected else cursor
        return {"changes": changes, "next_cursor": next_cursor, "has_more": has_more}

    def put_artifact(self, content: bytes, media_type: str) -> dict[str, Any]:
        return asdict(self.artifacts.execute(content, media_type))
