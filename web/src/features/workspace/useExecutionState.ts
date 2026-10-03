import { useState } from "react";
import type { Profile } from "../../api/types";

export function useExecutionState() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState("");
  const [queuedFor, setQueuedFor] = useState<string | null>(null);
  return { profiles, setProfiles, profileId, setProfileId, queuedFor, setQueuedFor };
}
