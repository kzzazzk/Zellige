from dataclasses import dataclass

from zellige.application.port.clock import Clock
from zellige.application.port.persistence.persistence_conflict import (
    PersistenceConflict,
)
from zellige.application.port.persistence.unit_of_work import UnitOfWork
from zellige.application.usecase.runtime_profile import (
    CreateRuntimeProfile,
    RuntimeProfileList,
    RuntimeProfileUseCase,
)
from zellige.domain.exception.domain_error import ConflictError
from zellige.domain.model.runtime_profile import VersionedRuntimeProfile


@dataclass
class RuntimeProfileService(RuntimeProfileUseCase):
    unit_of_work: UnitOfWork
    clock: Clock

    def list(self) -> RuntimeProfileList:
        with self.unit_of_work.read() as repositories:
            return RuntimeProfileList(
                profiles=repositories.runtime_profiles.find_latest()
            )

    def create(self, command: CreateRuntimeProfile) -> VersionedRuntimeProfile:
        created = VersionedRuntimeProfile.create(
            id=command.id,
            version_id=command.version_id,
            name=command.name,
            description=command.description,
            definition=command.definition,
            now=self.clock(),
        )
        try:
            with self.unit_of_work.write() as repositories:
                repositories.runtime_profiles.add(
                    created.runtime_profile, created.version
                )
        except PersistenceConflict as error:
            raise ConflictError(
                "already_exists", "runtime profile already exists"
            ) from error
        return created
