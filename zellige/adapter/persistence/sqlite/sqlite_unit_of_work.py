import contextlib
import sqlite3
from collections.abc import Iterator

from zellige.adapter.persistence.sqlite.database import Database
from zellige.adapter.persistence.sqlite.sqlite_artifact_repository import (
    SQLiteArtifactRepository,
)
from zellige.adapter.persistence.sqlite.sqlite_branch_repository import (
    SQLiteBranchRepository,
)
from zellige.adapter.persistence.sqlite.sqlite_change_repository import (
    SQLiteChangeRepository,
)
from zellige.adapter.persistence.sqlite.sqlite_conversation_repository import (
    SQLiteConversationRepository,
)
from zellige.adapter.persistence.sqlite.sqlite_item_repository import (
    SQLiteItemRepository,
)
from zellige.adapter.persistence.sqlite.sqlite_run_repository import (
    SQLiteRunRepository,
)
from zellige.adapter.persistence.sqlite.sqlite_runtime_profile_repository import (
    SQLiteRuntimeProfileRepository,
)
from zellige.application.port.clock import Clock
from zellige.application.port.persistence.persistence_conflict import (
    PersistenceConflict,
)
from zellige.application.port.persistence.unit_of_work import (
    ReadRepositories,
    Repositories,
)


class SQLiteUnitOfWork:
    """Open one transaction for all repositories in a service operation."""

    def __init__(self, database: Database, clock: Clock) -> None:
        self.database = database
        self.clock = clock

    def _repositories(self, connection: sqlite3.Connection) -> Repositories:
        return Repositories(
            conversations=SQLiteConversationRepository(connection, self.clock),
            branches=SQLiteBranchRepository(connection, self.clock),
            items=SQLiteItemRepository(connection, self.clock),
            runs=SQLiteRunRepository(connection, self.clock),
            runtime_profiles=SQLiteRuntimeProfileRepository(connection, self.clock),
            changes=SQLiteChangeRepository(connection, self.clock),
            artifacts=SQLiteArtifactRepository(connection, self.clock),
        )

    @contextlib.contextmanager
    def read(self) -> Iterator[ReadRepositories]:
        with self.database.transaction() as connection:
            yield self._repositories(connection)

    @contextlib.contextmanager
    def write(self) -> Iterator[Repositories]:
        try:
            with self.database.transaction(immediate=True) as connection:
                yield self._repositories(connection)
        except sqlite3.IntegrityError as error:
            raise PersistenceConflict(str(error)) from error

    def check(self) -> str:
        return self.database.quick_check()
