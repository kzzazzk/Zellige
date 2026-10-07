from dataclasses import dataclass

from zellige.domain.exception.domain_error import InvalidError
from zellige.domain.model.identifiers import Identifiers
from zellige.domain.model.types import JsonObject


@dataclass(frozen=True, kw_only=True)
class RuntimeProfile:
    id: str
    name: str
    description: str | None
    created_at: int


@dataclass(frozen=True, kw_only=True)
class RuntimeProfileVersion:
    id: str
    runtime_profile_id: str
    version: int
    definition: JsonObject
    created_at: int


@dataclass(frozen=True, kw_only=True)
class VersionedRuntimeProfile:
    runtime_profile: RuntimeProfile
    version: RuntimeProfileVersion

    @classmethod
    def create(
        cls,
        *,
        id: str | None,
        version_id: str | None,
        name: str,
        description: str | None,
        definition: JsonObject,
        now: int,
    ) -> "VersionedRuntimeProfile":
        """A new profile with its immutable version 1."""
        if not isinstance(name, str) or not name or not isinstance(definition, dict):
            raise InvalidError("invalid_request", "name and definition are required")
        profile = RuntimeProfile(
            id=id or Identifiers.new("profile"),
            name=name,
            description=description,
            created_at=now,
        )
        version = RuntimeProfileVersion(
            id=version_id or Identifiers.new("profilev"),
            runtime_profile_id=profile.id,
            version=1,
            definition=definition,
            created_at=now,
        )
        return cls(runtime_profile=profile, version=version)
