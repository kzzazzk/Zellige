from dataclasses import dataclass

from zellige.application.port.persistence.unit_of_work import UnitOfWork
from zellige.application.usecase.system import Health, SystemUseCase


@dataclass
class SystemService(SystemUseCase):
    unit_of_work: UnitOfWork

    def health(self) -> Health:
        return Health(status="ok", database=self.unit_of_work.check())
