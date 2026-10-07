import type { Dispatch, SetStateAction } from "react";
import type { Client } from "../../api/client";
import { classifyChanges, drainChanges } from "../../api/changes";
import { listConversations } from "../../api/conversations";
import { listProfiles } from "../../api/runs";
import type { Profile } from "../../api/types";
import { loadThread } from "./loadThread";
import type { useWorkspaceServerState } from "./useWorkspaceServerState";
import type { useDiagnostics } from "./useDiagnostics";
import type { Operation } from "./useWorkspaceOperation";

type Dependencies = Pick<ReturnType<typeof useWorkspaceServerState>,
  "archived" | "query" | "thread" | "setPage" | "setThread"
> & Pick<ReturnType<typeof useDiagnostics>,
  "cursor" | "setCursor" | "setChanges" | "setHasMoreChanges"
> & Pick<Operation, "perform" | "performBackground" | "record"> & {
  client: Client;
  setProfiles: Dispatch<SetStateAction<Profile[]>>;
};

export function syncActions({
  client,
  perform,
  performBackground,
  record,
  cursor,
  archived,
  query,
  thread,
  setPage,
  setThread,
  setProfiles,
  setChanges,
  setHasMoreChanges,
  setCursor,
}: Dependencies) {
  async function synchronize(
    publishHttpDiagnostics: boolean,
    isCurrent: () => boolean = () => true,
  ) {
    const drained = await drainChanges(client, cursor);
    const invalidated = classifyChanges(
      drained.data.changes,
      thread?.conversation.id ?? null,
    );

    // Reads are staged first. Any failure or stale background attempt leaves
    // canonical state and the acknowledged cursor untouched.
    const [page, refreshedThread, profiles] = await Promise.all([
      invalidated.conversations
        ? listConversations(client, archived, query)
        : null,
      invalidated.thread && thread
        ? loadThread(client, thread.conversation.id, thread.branch.id)
        : null,
      invalidated.profiles ? listProfiles(client) : null,
    ]);

    if (!isCurrent()) return;

    if (page) setPage(page.data);
    if (refreshedThread) setThread(refreshedThread);
    if (profiles) setProfiles(profiles.data.profiles);

    const result = publishHttpDiagnostics ? record(drained) : drained.data;
    setChanges(result.changes);
    setHasMoreChanges(false);

    // Cursor-last: acknowledge only after every authoritative read and cache write.
    setCursor(result.next_cursor);
  }

  function readChanges() {
    return perform(() => synchronize(true));
  }

  function readChangesInBackground(
    isExternalStateCurrent: () => boolean = () => true,
  ) {
    return performBackground((isOperationCurrent) =>
      synchronize(
        false,
        () => isOperationCurrent() && isExternalStateCurrent(),
      ),
    );
  }

  return { readChanges, readChangesInBackground };
}
