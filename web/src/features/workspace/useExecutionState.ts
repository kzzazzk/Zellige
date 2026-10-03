import { useState } from "react";

export function useExecutionState() {
  const [profileId, setProfileId] = useState("");
  const [queuedFor, setQueuedFor] = useState<string | null>(null);
  return { profileId, setProfileId, queuedFor, setQueuedFor };
}
