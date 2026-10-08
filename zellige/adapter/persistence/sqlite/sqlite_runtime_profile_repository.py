from zellige.adapter.persistence.sqlite.change_data import (
    runtime_profile_data,
    runtime_profile_version_data,
)
from zellige.adapter.persistence.sqlite.codec import to_json
from zellige.adapter.persistence.sqlite.row_mapper import (
    runtime_profile_from_row,
    runtime_profile_version_from_row,
)
from zellige.adapter.persistence.sqlite.sqlite_repository import SQLiteRepository
from zellige.domain.model.runtime_profile import (
    RuntimeProfile,
    RuntimeProfileVersion,
    VersionedRuntimeProfile,
)


class SQLiteRuntimeProfileRepository(SQLiteRepository):
    def find_latest(self) -> list[VersionedRuntimeProfile]:
        result = []
        for profile_row in self._fetch_all(
            "SELECT * FROM runtime_profiles ORDER BY name, id"
        ):
            version_row = self._fetch_one(
                "SELECT * FROM runtime_profile_versions WHERE runtime_profile_id = ? ORDER BY version DESC LIMIT 1",
                profile_row["id"],
            )
            assert (
                version_row is not None
            )  # profile and initial version are created in one transaction
            result.append(
                VersionedRuntimeProfile(
                    runtime_profile=runtime_profile_from_row(profile_row),
                    version=runtime_profile_version_from_row(version_row),
                )
            )
        return result

    def add(self, profile: RuntimeProfile, version: RuntimeProfileVersion) -> None:
        self.db.execute(
            "INSERT INTO runtime_profiles VALUES (?, ?, ?, ?)",
            (profile.id, profile.name, profile.description, profile.created_at),
        )
        self.db.execute(
            "INSERT INTO runtime_profile_versions VALUES (?, ?, ?, ?, ?)",
            (
                version.id,
                profile.id,
                version.version,
                to_json(version.definition),
                version.created_at,
            ),
        )
        self._log("runtime_profile", profile.id, runtime_profile_data(profile))
        self._log(
            "runtime_profile_version", version.id, runtime_profile_version_data(version)
        )
