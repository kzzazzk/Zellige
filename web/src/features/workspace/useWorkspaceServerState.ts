import { useCallback, useState, useSyncExternalStore, type SetStateAction } from "react";
import { hashKey, useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { ConversationPage, Profile } from "../../api/types";
import type { Thread } from "./types";
import { workspaceKeys } from "./queryKeys";

const emptyPage: ConversationPage = { conversations: [], has_more: false };
const emptyProfiles: Profile[] = [];
type Selection = { conversationId: string; branchId: string };

// Subscribe directly to Query's canonical cache. There is deliberately no query
// function here: reads belong to explicit gated workflows, including sync staging.
// Cache removal is observable too, so disconnect cannot retain an observer's data.
function useCachedValue<T>(key: QueryKey) {
  const client = useQueryClient();
  const hash = hashKey(key);
  const subscribe = useCallback((notify: () => void) => client.getQueryCache().subscribe((event) => {
    if (event.query.queryHash === hash) notify();
  }), [client, hash]);
  const snapshot = () => client.getQueryData<T>(key);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function useWorkspaceServerState() {
  const client = useQueryClient();
  const [archived, setArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);
  const page = useCachedValue<ConversationPage>(workspaceKeys.conversations(archived, query)) ?? emptyPage;
  const selectedThread = useCachedValue<Thread>(workspaceKeys.thread(selection?.conversationId ?? "", selection?.branchId ?? ""));
  const thread = selection ? selectedThread ?? null : null;
  const profiles = useCachedValue<Profile[]>(workspaceKeys.profiles) ?? emptyProfiles;

  const setPage = useCallback((value: SetStateAction<ConversationPage>,
    filters = { archived, query }) => {
    const key = workspaceKeys.conversations(filters.archived, filters.query);
    client.setQueryData<ConversationPage>(key, (current) =>
      typeof value === "function" ? value(current ?? emptyPage) : value);
  }, [client, archived, query]);

  const setThread = useCallback((value: SetStateAction<Thread | null>) => {
    const current = selection
      ? client.getQueryData<Thread>(workspaceKeys.thread(selection.conversationId, selection.branchId)) ?? null
      : null;
    const next = typeof value === "function" ? value(current) : value;
    if (next) {
      // loadThread may resolve a missing/empty branch hint to the first branch.
      // Only the authoritative key is cached; aliases never become stale copies.
      client.setQueryData(workspaceKeys.thread(next.conversation.id, next.branch.id), next);
    }
    setSelection(next ? { conversationId: next.conversation.id, branchId: next.branch.id } : null);
  }, [client, selection]);

  const setProfiles = useCallback((value: SetStateAction<Profile[]>) => {
    client.setQueryData<Profile[]>(workspaceKeys.profiles, (current) =>
      typeof value === "function" ? value(current ?? emptyProfiles) : value);
  }, [client]);

  const clearServerState = useCallback(() => {
    client.removeQueries({ queryKey: workspaceKeys.all });
    setSelection(null);
  }, [client]);

  // Initial reads are staged before calling this. Clearing is terminal only for
  // successful authentication; failed reconnects never touch the existing cache.
  const restoreServerState = useCallback((page: ConversationPage, profiles: Profile[], thread: Thread | null) => {
    client.removeQueries({ queryKey: workspaceKeys.all });
    client.setQueryData(workspaceKeys.conversations(false, ""), page);
    client.setQueryData(workspaceKeys.profiles, profiles);
    if (thread) client.setQueryData(workspaceKeys.thread(thread.conversation.id, thread.branch.id), thread);
    setSelection(thread ? { conversationId: thread.conversation.id, branchId: thread.branch.id } : null);
  }, [client]);

  return { page, setPage, archived, setArchived, query, setQuery, thread, setThread,
    profiles, setProfiles, clearServerState, restoreServerState };
}
