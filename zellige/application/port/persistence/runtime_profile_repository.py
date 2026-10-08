from typing import Protocol

from zellige.domain.model.runtime_profile import (
    RuntimeProfile,
    RuntimeProfileVersion,
    VersionedRuntimeProfile,
)


class RuntimeProfileQueries(Protocol):
    def find_latest(self) -> list[VersionedRuntimeProfile]: ...


class RuntimeProfileRepository(RuntimeProfileQueries, Protocol):
    def add(self, profile: RuntimeProfile, version: RuntimeProfileVersion) -> None: ...
