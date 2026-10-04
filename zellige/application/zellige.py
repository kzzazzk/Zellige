"""The Zellige core: every operation any client (web, mobile, CLI...) can perform.

Adapters drive the core through this class only. Most operations are plain CRUD and
stay one or two lines; the real rules live in zellige.domain and are applied in
append_item, update_conversation, create_run, history and put_artifact.
"""
import time
import uuid
from collections.abc import Callable
from dataclasses import asdict

from zellige.application.ports import BlobStore, Session, Store
from zellige.domain.artifacts import artifact_for
from zellige.domain.conversations import (
    ancestry, artifact_links, bump, check_head, require_names, revise_conversation,
)
from zellige.domain.errors import DomainError, PersistenceConflict
from zellige.domain.models import Record
from zellige.domain.payloads import validate_payload


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def microseconds() -> int:
    return time.time_ns() // 1_000


def _conflict(code: str, message: str) -> DomainError:
    return DomainError("conflict", code, message)


class Zellige:
    def __init__(self, store: Store, blobs: BlobStore, clock: Callable[[], int] = microseconds):
        self.store = store
        self.blobs = blobs
        self.clock = clock

    # --- System -----------------------------------------------------------------
    def health(self) -> Record:
        return {"status": "ok", "database": self.store.check()}

    # --- Conversations ----------------------------------------------------------
    def create_conversation(self, body: Record) -> Record:
        conversation_id = body.get("id") or new_id("conv")
        branch_id = body.get("branch_id") or new_id("branch")
        title = body.get("title", "New conversation")
        branch_name = body.get("branch_name", "main")
        require_names(conversation_id, branch_id, title, branch_name)
        now = self.clock()
        conversation = {"id": conversation_id, "title": title, "created_at": now,
                        "updated_at": now, "deleted_at": None, "archived_at": None}
        branch = {"id": branch_id, "conversation_id": conversation_id, "name": branch_name,
                  "head_item_id": None, "created_at": now, "updated_at": now}
        try:
            with self.store.write() as session:
                session.add_conversation(conversation)
                session.add_branch(branch)
        except PersistenceConflict as error:
            raise _conflict("already_exists", "conversation or branch already exists") from error
        return {"conversation": conversation, "branch": branch}

    def list_conversations(self, archived: bool = False, query: str = "", limit: int = 50, offset: int = 0) -> Record:
        with self.store.read() as session:
            rows = session.conversations(archived, query, limit + 1, offset)
        return {"conversations": rows[:limit], "has_more": len(rows) > limit}

    def get_conversation(self, conversation_id: str) -> Record:
        with self.store.read() as session:
            return self._conversation(session, conversation_id)

    def update_conversation(self, conversation_id: str, body: Record) -> Record:
        with self.store.write() as session:
            revised = revise_conversation(self._conversation(session, conversation_id), body, self.clock())
            session.save_conversation(revised)
        return revised

    # --- Branches and items -----------------------------------------------------
    def list_branches(self, conversation_id: str) -> Record:
        with self.store.read() as session:
            self._conversation(session, conversation_id)
            return {"branches": session.branches(conversation_id)}

    def create_branch(self, conversation_id: str, body: Record) -> Record:
        require_names(body.get("name"))
        now = self.clock()
        branch = {"id": body.get("id") or new_id("branch"), "conversation_id": conversation_id,
                  "name": body["name"], "head_item_id": body.get("head_item_id"),
                  "created_at": now, "updated_at": now}
        try:
            with self.store.write() as session:
                session.add_branch(branch)
        except PersistenceConflict as error:
            raise _conflict("invalid_branch", "branch name, id, or head is invalid") from error
        return branch

    def append_item(self, conversation_id: str, branch_id: str, body: Record) -> Record:
        """Append an immutable item at the branch head; a stale head is a conflict, never a rebase."""
        expected = body.get("expected_head_item_id")
        kind, version, run_id = body.get("kind"), body.get("payload_schema_version", 1), body.get("run_id")
        payload = validate_payload(kind, body.get("payload"), version)
        now = self.clock()
        item = {"id": body.get("id") or new_id("item"), "conversation_id": conversation_id,
                "parent_item_id": expected, "run_id": run_id, "kind": kind,
                "payload_schema_version": version, "payload": payload, "created_at": now}
        try:
            with self.store.write() as session:
                branch = session.branch(conversation_id, branch_id)
                if branch is None:
                    raise DomainError("not_found", "branch_not_found", "branch not found")
                check_head(expected, branch["head_item_id"])
                if run_id is not None:
                    run = session.run(conversation_id, run_id)
                    if run is None or run["branch_id"] != branch_id:
                        raise _conflict("invalid_item", "run must belong to the target conversation and branch")
                session.add_item(item, artifact_links(payload))
                moved = {**branch, "head_item_id": item["id"], "updated_at": bump(branch["updated_at"], now)}
                if not session.move_head(moved, expected):
                    raise _conflict("head_conflict", "branch head has changed")
                conversation = session.conversation(conversation_id, include_deleted=True)
                assert conversation is not None  # the branch's foreign key guarantees it
                session.save_conversation({**conversation, "updated_at": bump(conversation["updated_at"], now)})
        except PersistenceConflict as error:
            raise _conflict("invalid_item", "item id, parent, or run is invalid") from error
        return item

    def history(self, conversation_id: str, branch_id: str) -> Record:
        with self.store.read() as session:
            branch = session.branch(conversation_id, branch_id)
            if branch is None:
                raise DomainError("not_found", "branch_not_found", "branch not found")
            items = ancestry(branch["head_item_id"], lambda item_id: session.item(conversation_id, item_id))
        return {"branch": branch, "items": items}

    # --- Execution: profiles, context packs, runs -------------------------------
    def list_runtime_profiles(self) -> Record:
        with self.store.read() as session:
            return {"profiles": session.profiles()}

    def create_runtime_profile(self, body: Record) -> Record:
        profile, version = self._versioned(body, "profile", "runtime_profile_id", "definition")
        try:
            with self.store.write() as session:
                session.add_profile(profile, version)
        except PersistenceConflict as error:
            raise _conflict("already_exists", "runtime profile already exists") from error
        return {"runtime_profile": profile, "version": version}

    def create_context_pack(self, body: Record) -> Record:
        pack, version = self._versioned(body, "context", "context_pack_id", "manifest")
        try:
            with self.store.write() as session:
                session.add_context_pack(pack, version)
        except PersistenceConflict as error:
            raise _conflict("already_exists", "context pack already exists") from error
        return {"context_pack": pack, "version": version}

    def add_context_pack_version(self, pack_id: str, body: Record) -> Record:
        if not isinstance(body.get("manifest"), dict):
            raise DomainError("invalid", "invalid_request", "manifest is required")
        try:
            with self.store.write() as session:
                current = session.latest_context_version(pack_id)
                if current == 0:
                    raise DomainError("not_found", "context_pack_not_found", "context pack not found")
                version = {"id": body.get("id") or new_id("contextv"), "context_pack_id": pack_id,
                           "version": current + 1, "manifest": body["manifest"], "created_at": self.clock()}
                session.add_context_version(version)
        except PersistenceConflict as error:
            raise _conflict("already_exists", "context pack version already exists") from error
        return version

    def list_runs(self, conversation_id: str) -> Record:
        with self.store.read() as session:
            self._conversation(session, conversation_id)
            return {"runs": session.runs(conversation_id, 50)}

    def create_run(self, body: Record) -> Record:
        """Queue a run against the branch head as it is now."""
        conversation_id, branch_id = body.get("conversation_id"), body.get("branch_id")
        require_names(conversation_id, branch_id, body.get("runtime_profile_version_id"))
        request, contexts = body.get("request", {}), body.get("context_pack_version_ids", [])
        if not isinstance(request, dict) or not isinstance(contexts, list) or not all(isinstance(v, str) for v in contexts):
            raise DomainError("invalid", "invalid_request", "request or context pack versions are invalid")
        try:
            with self.store.write() as session:
                branch = session.branch(conversation_id, branch_id)
                if branch is None:
                    raise _conflict("invalid_run", "run conversation or branch is invalid")
                run = {"id": body.get("id") or new_id("run"), "conversation_id": conversation_id,
                       "branch_id": branch_id, "input_head_item_id": branch["head_item_id"],
                       "runtime_profile_version_id": body["runtime_profile_version_id"],
                       "provider_session_id": body.get("provider_session_id"), "status": "queued",
                       "request": request, "result": None, "created_at": self.clock(),
                       "started_at": None, "completed_at": None, "context_pack_version_ids": contexts}
                session.add_run(run)
        except PersistenceConflict as error:
            raise _conflict("invalid_run", "run references are invalid or duplicated") from error
        return run

    # --- Sync and artifacts -----------------------------------------------------
    def changes(self, cursor: int, limit: int) -> Record:
        if cursor < 0 or not 1 <= limit <= 1_000:
            raise DomainError("invalid", "invalid_cursor", "cursor must be non-negative and limit between 1 and 1000")
        with self.store.read() as session:
            rows = session.changes(cursor, limit + 1)
        selected = rows[:limit]
        return {"changes": selected, "next_cursor": selected[-1]["seq"] if selected else cursor,
                "has_more": len(rows) > limit}

    def put_artifact(self, content: bytes, media_type: str) -> Record:
        """Store bytes by content; identical uploads return the first stored artifact."""
        artifact = artifact_for(content, media_type, self.clock())
        # Bytes first, so committed metadata never points to missing content.
        self.blobs.put(artifact.storage_key, content)
        with self.store.write() as session:
            return asdict(session.save_artifact_if_absent(artifact))

    # --- Helpers ----------------------------------------------------------------
    @staticmethod
    def _conversation(session: Session, conversation_id: str) -> Record:
        conversation = session.conversation(conversation_id)
        if conversation is None:
            raise DomainError("not_found", "conversation_not_found", "conversation not found")
        return conversation

    def _versioned(self, body: Record, prefix: str, owner_key: str, content_key: str) -> tuple[Record, Record]:
        """A named resource and its first version (runtime profiles and context packs)."""
        if not isinstance(body.get("name"), str) or not body["name"] or not isinstance(body.get(content_key), dict):
            raise DomainError("invalid", "invalid_request", f"name and {content_key} are required")
        now, resource_id = self.clock(), body.get("id") or new_id(prefix)
        resource = {"id": resource_id, "name": body["name"], "description": body.get("description"), "created_at": now}
        version = {"id": body.get("version_id") or new_id(f"{prefix}v"), owner_key: resource_id,
                   "version": 1, content_key: body[content_key], "created_at": now}
        return resource, version
