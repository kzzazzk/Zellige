import type { Dispatch, SetStateAction } from "react";
import type { Client } from "../../api/client";
import type { Operation } from "./useWorkspaceOperation";
import type { Thread } from "./types";
import { createProfile, createRun } from "../../api/runs";
import { ApiError, type Profile } from "../../api/types";

type Dependencies = Pick<Operation, "perform" | "record"> & {
  client: Client;
  thread: Thread | null;
  profileId: string;
  draftKey: string;
  setThread: Dispatch<SetStateAction<Thread | null>>;
  setProfiles: Dispatch<SetStateAction<Profile[]>>;
  setProfileId: Dispatch<SetStateAction<string>>;
  setQueuedFor: Dispatch<SetStateAction<string | null>>;
};
export function executionActions({ client, perform, record, thread, profileId, draftKey,
  setThread, setProfiles, setProfileId, setQueuedFor }: Dependencies) {
  function addProfile(name: string, mode: string) {
    return perform(async () => {
      const result = record(await createProfile(client, name.trim(), mode));
      setProfiles((current) => [...current, result]);
      setProfileId(result.version.id);
    });
  }

  function queueRun() {
    return perform(async () => {
      if (!thread || !profileId)
        throw new ApiError("Selecciona una conversación y un perfil.", null);
      const run = record(
        await createRun(
          client,
          thread.conversation.id,
          thread.branch.id,
          profileId,
        ),
      );
      setThread({ ...thread, runs: [run, ...thread.runs] });
      setQueuedFor(draftKey);
    });
  }

  return { addProfile, queueRun };
}
