import { createClient } from "../../api/client";
import { listConversations } from "../../api/conversations";
import { listProfiles } from "../../api/runs";
import { ApiError } from "../../api/types";
import type { ConversationPage, Profile } from "../../api/types";
import type { Operation } from "./useWorkspaceOperation";

type Dependencies = Pick<Operation, "perform" | "record"> & {
  onConnected: (token: string) => void;
  restoreServerState: (page: ConversationPage, profiles: Profile[], thread: null) => void;
};
export function connectionActions({ perform, record, onConnected, restoreServerState }: Dependencies) {
  function connect(value: string) {
    return perform(async () => {
      const next = value.trim();
      if (!next)
        throw new ApiError("Introduce la clave de acceso del servidor.", null);
      const connection = createClient(() => next);
      const [conversations, profileList] = await Promise.all([
        listConversations(connection),
        listProfiles(connection),
      ]);
      restoreServerState(record(conversations), profileList.data.profiles, null);
      onConnected(next);
    });
  }

  return { connect };
}
