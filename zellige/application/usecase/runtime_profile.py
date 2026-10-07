from dataclasses import dataclass
from typing import Protocol

from zellige.domain.model.runtime_profile import VersionedRuntimeProfile
from zellige.domain.model.types import JsonObject


@dataclass(frozen=True, kw_only=True)
class CreateRuntimeProfile:
    name: str
    definition: JsonObject
    id: str | None = None
    version_id: str | None = None
    description: str | None = None


@dataclass(frozen=True, kw_only=True)
class RuntimeProfileList:
    profiles: list[VersionedRuntimeProfile]


class RuntimeProfileUseCase(Protocol):
    def list(self) -> RuntimeProfileList: ...

    def create(self, command: CreateRuntimeProfile) -> VersionedRuntimeProfile: ...
