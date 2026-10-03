import type { Dispatch, SetStateAction } from "react";
import type { Client } from "../../api/client";
import { classifyChanges, drainChanges } from "../../api/changes";
import { listConversations } from "../../api/conversations";
import { listProfiles } from "../../api/runs";
import type { Profile } from "../../api/types";
import { loadThread } from "./loadThread";
import type { useConversationState } from "./useConversationState";
import type { useDiagnostics } from "./useDiagnostics";
import type { Operation } from "./useWorkspaceOperation";

type Dependencies = Pick<ReturnType<typeof useConversationState>,
  "archived" | "query" | "thread" | "setPage" | "setThread"
> & Pick<ReturnType<typeof useDiagnostics>,
  "cursor" | "setCursor" | "setChanges" | "setHasMoreChanges"
> & Pick<Operation, "perform" | "record"> & {
  client: Client;
  setProfiles: Dispatch<SetStateAction<Profile[]>>;
};

export function syncActions({ client, perform, record, cursor, archived, query, thread,
  setPage, setThread, setProfiles, setChanges, setHasMoreChanges, setCursor }: Dependencies) {
  function readChanges() {
    return perform(async () => {
      const drained = await drainChanges(client, cursor);
      const invalidated = classifyChanges(drained.data.changes, thread?.conversation.id ?? null);
      // These reads only stage results. A failed read must leave every canonical
      // state slice and the acknowledged cursor untouched for replay on retry.
      const [page, refreshedThread, profiles] = await Promise.all([
        invalidated.conversations ? listConversations(client, archived, query) : null,
        invalidated.thread && thread ? loadThread(client, thread.conversation.id, thread.branch.id) : null,
        invalidated.profiles ? listProfiles(client) : null,
      ]);

      if (page) setPage(page.data);
      // Keep the captured thread authoritative even if navigation changed while
      // the gate was held. Pending routing hides it, and Phase 2 resolves any
      // different destination after release. This also preserves invalidations
      // when history returns to the same conversation/branch before completion.
      if (refreshedThread) setThread(refreshedThread);
      if (profiles) setProfiles(profiles.data.profiles);
      const result = record(drained);
      setChanges(result.changes);
      setHasMoreChanges(false);
      // Acknowledge only after all authoritative reads and state application.
      setCursor(result.next_cursor);
    });
  }

  return { readChanges };
}
