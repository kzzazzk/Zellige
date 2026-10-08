from dataclasses import dataclass, field
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from zellige.adapter.clock.system_clock import SystemClock
from zellige.adapter.persistence.sqlite.database import Database
from zellige.adapter.persistence.sqlite.sqlite_unit_of_work import (
    SQLiteUnitOfWork,
)
from zellige.adapter.storage.file_blob_store import FileBlobStore
from zellige.adapter.web.http_application import HTTPApplication
from zellige.application.port.blob_store import BlobStore
from zellige.application.port.clock import Clock
from zellige.application.port.persistence.unit_of_work import UnitOfWork
from zellige.application.service.artifact_service import ArtifactService
from zellige.application.service.branch_service import BranchService
from zellige.application.service.conversation_service import ConversationService
from zellige.application.service.run_service import RunService
from zellige.application.service.runtime_profile_service import RuntimeProfileService
from zellige.application.service.synchronization_service import (
    SynchronizationService,
)
from zellige.application.service.system_service import SystemService
from zellige.application.usecase.zellige import Zellige


@dataclass(frozen=True)
class ZelligeConfiguration:
    data_dir: Path
    token: str
    web_dir: Path | None = None
    clock: Clock = field(default_factory=SystemClock)

    def build(self) -> FastAPI:
        project_root = Path(__file__).resolve().parents[2]
        packaged_migrations = Path(__file__).resolve().parents[1] / "migrations"
        migrations_dir = (
            packaged_migrations
            if packaged_migrations.is_dir()
            else project_root / "db" / "migrations"
        )
        database = Database(self.data_dir / "zellige.sqlite3", migrations_dir)
        use_cases = self.use_cases(
            SQLiteUnitOfWork(database, self.clock),
            FileBlobStore(self.data_dir / "blobs"),
            self.clock,
        )
        app = HTTPApplication(use_cases, self.token).build()
        app.state.database = database
        assets = (
            self.web_dir if self.web_dir is not None else project_root / "web" / "dist"
        )
        if (assets / "index.html").is_file():
            app.mount("/", StaticFiles(directory=assets, html=True), name="web")
        return app

    @staticmethod
    def use_cases(unit_of_work: UnitOfWork, blobs: BlobStore, clock: Clock) -> Zellige:
        """Inject the port implementations into the services behind every use case."""
        return Zellige(
            conversations=ConversationService(unit_of_work, clock),
            branches=BranchService(unit_of_work, clock),
            profiles=RuntimeProfileService(unit_of_work, clock),
            runs=RunService(unit_of_work, clock),
            synchronization=SynchronizationService(unit_of_work),
            artifacts=ArtifactService(unit_of_work, blobs, clock),
            system=SystemService(unit_of_work),
        )
