from dataclasses import dataclass

from zellige.application.port.clock import Clock
from zellige.application.port.persistence.persistence_conflict import (
    PersistenceConflict,
)
from zellige.application.port.persistence.unit_of_work import UnitOfWork
from zellige.application.service.lookups import require_conversation
from zellige.application.usecase.run import CreateRun, RunList, RunUseCase
from zellige.domain.exception.domain_error import ConflictError
from zellige.domain.model.run import Run


@dataclass
class RunService(RunUseCase):
    unit_of_work: UnitOfWork
    clock: Clock

    def list(self, conversation_id: str, limit: int = 50, offset: int = 0) -> RunList:
        with self.unit_of_work.read() as repositories:
            require_conversation(repositories, conversation_id)
            rows = repositories.runs.find_all(conversation_id, limit + 1, offset)
        return RunList(runs=rows[:limit], has_more=len(rows) > limit)

    def create(self, command: CreateRun) -> Run:
        try:
            with self.unit_of_work.write() as repositories:
                branch = repositories.branches.find_by_id(
                    command.conversation_id, command.branch_id
                )
                if branch is None:
                    raise ConflictError(
                        "invalid_run", "run conversation or branch is invalid"
                    )
                run = Run.create(
                    id=command.id,
                    conversation_id=command.conversation_id,
                    branch_id=command.branch_id,
                    input_head_item_id=branch.head_item_id,
                    runtime_profile_version_id=command.runtime_profile_version_id,
                    provider_session_id=command.provider_session_id,
                    request=command.request,
                    now=self.clock(),
                )
                repositories.runs.add(run)
        except PersistenceConflict as error:
            raise ConflictError(
                "invalid_run", "run references are invalid or duplicated"
            ) from error
        return run
