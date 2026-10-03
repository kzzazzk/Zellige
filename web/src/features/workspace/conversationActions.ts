import type { Dispatch, SetStateAction } from "react";
import type { Client } from "../../api/client";
import type { Operation } from "./useWorkspaceOperation";
import { listConversations, updateConversation } from "../../api/conversations";
import { listProfiles } from "../../api/runs";
import { ApiError, type Conversation, type Profile } from "../../api/types";
import { loadThread } from "./loadThread";
import type { useWorkspaceServerState } from "./useWorkspaceServerState";

type Dependencies = Pick<ReturnType<typeof useWorkspaceServerState>,
  "page" | "setPage" | "archived" | "setArchived" | "query" | "setQuery" | "thread" | "setThread"
> & Pick<Operation, "perform" | "record"> & {
  client: Client;
  setProfiles: Dispatch<SetStateAction<Profile[]>>;
};
export function conversationActions({ client, perform, record, page, setPage, archived,
  setArchived, query, setQuery, thread, setThread, setProfiles }: Dependencies) {
  async function refreshList() {
    setPage(record(await listConversations(client, archived, query)));
  }

  function selectConversation(id: string, branchId = "") {
    return perform(async () => {
      setThread(await loadThread(client, id, branchId));
    });
  }

  function search(value: string, showArchived = archived) {
    return perform(async () => {
      setPage(record(await listConversations(client, showArchived, value)), { archived: showArchived, query: value });
      setArchived(showArchived);
      setQuery(value);
    });
  }

  function loadMore() {
    return perform(async () => {
      const result = record(
        await listConversations(
          client,
          archived,
          query,
          page.conversations.length,
        ),
      );
      const seen = new Set(page.conversations.map((entry) => entry.id));
      setPage({
        conversations: [
          ...page.conversations,
          ...result.conversations.filter((entry) => !seen.has(entry.id)),
        ],
        has_more: result.has_more,
      });
    });
  }

  function refresh() {
    return perform(async () => {
      await refreshList();
      if (thread)
        setThread(
          await loadThread(client, thread.conversation.id, thread.branch.id),
        );
      setProfiles((await listProfiles(client)).data.profiles);
    });
  }

  function changeConversation(
    conversation: Conversation,
    change: { title?: string; archived?: boolean },
  ) {
    return perform(async () => {
      try {
        const updated = record(
          await updateConversation(client, conversation, change),
        );
        if (thread?.conversation.id === updated.id)
          setThread({ ...thread, conversation: updated });
        await refreshList();
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          await refreshList();
          if (thread)
            setThread(
              await loadThread(
                client,
                thread.conversation.id,
                thread.branch.id,
              ),
            );
        }
        throw error;
      }
    });
  }

  return { refreshList, selectConversation, search, loadMore, refresh, changeConversation };
}
