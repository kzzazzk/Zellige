import { useState } from "react";
import { useWorkspaceRoute, type WorkspaceNavigation } from "../app/useWorkspaceNavigation";
import { draftKey as getDraftKey } from "./workspace/draftKey";
import { useWorkspaceSnapshot, useWorkspaceSession } from "./workspace/useWorkspaceSession";
import { useWorkspaceOperation } from "./workspace/useWorkspaceOperation";
import { useDrafts } from "./workspace/useDrafts";
import { useWorkspaceServerState } from "./workspace/useWorkspaceServerState";
import { conversationActions } from "./workspace/conversationActions";
import { connectionActions } from "./workspace/connectionActions";
import { messageActions } from "./workspace/messageActions";
import { useExecutionState } from "./workspace/useExecutionState";
import { executionActions } from "./workspace/executionActions";
import { useDiagnostics } from "./workspace/useDiagnostics";
import { syncActions } from "./workspace/syncActions";
import { useRunAutoSync } from "./workspace/useRunAutoSync";

export type { Thread } from "./workspace/types";

export function useWorkspace(navigation?: WorkspaceNavigation) {
  const saved = useWorkspaceSnapshot();
  const operation = useWorkspaceOperation(!!saved.token);
  const { busy, failure, lastResponse, lastStatus, actionRunning, record, perform: rawPerform,
    performBackground, supersedeBackground, setFailure, setLastResponse, setLastStatus,
    releaseBootstrap } = operation;
  const { page, setPage, archived, setArchived, query, setQuery, thread, setThread,
    profiles, setProfiles, clearServerState, restoreServerState } = useWorkspaceServerState();
  const [initialRequest] = useState(() => navigation?.locationRequest);
  const target = navigation?.id ?? null;
  const pending = !!navigation && (navigation.invalid || navigation.request() !== navigation.locationRequest ||
    (thread?.conversation.id ?? null) !== target || (!!navigation.branch && navigation.branch !== thread?.branch.id));
  const routeRequest = navigation?.locationRequest;
  const perform: typeof rawPerform = (action) => (pending || (navigation && navigation.request() !== routeRequest)) ? Promise.resolve(false) : rawPerform(action);
  const draftKey = getDraftKey(thread);
  const drafts = useDrafts(draftKey);
  const { draft, setDraft } = drafts;
  const { profileId, setProfileId, queuedFor, setQueuedFor } = useExecutionState();
  const diagnostics = useDiagnostics(saved.cursor);
  const { cursor, changes, hasMoreChanges } = diagnostics;
  const { token, setToken, connected, setConnected, client } = useWorkspaceSession(
    saved, thread, cursor, restoreServerState, setFailure, releaseBootstrap, !!navigation, pending,
  );

  useWorkspaceRoute({ navigation, connected, operation, thread, setThread, saved, client, initialRequest });

  const { refreshList, selectConversation: selectThread, search, loadMore, refresh, changeConversation } = conversationActions({
    client, perform, record, page, setPage, archived, setArchived, query, setQuery, thread, setThread, setProfiles,
  });
  const { connect } = connectionActions({ perform: rawPerform, record, restoreServerState,
    onConnected(next) {
      setToken(next);
      drafts.reset();
      setQueuedFor(null);
      setConnected(true);
      setArchived(false);
      setQuery("");
      setProfileId("");
    },
  });

  function disconnect() {
    if (actionRunning.current || pending || (navigation && navigation.request() !== routeRequest)) return;
    supersedeBackground();
    drafts.reset();
    setQueuedFor(null);
    navigation?.navigate(null);
    setToken("");
    setConnected(false);
    clearServerState();
    setProfileId("");
    setFailure(null);
    setLastResponse(null);
    diagnostics.reset();
    setLastStatus(null);
    setQuery("");
  }

  function newChat() {
    if (!actionRunning.current && !pending && (!navigation || navigation.request() === routeRequest)) {
      supersedeBackground();
      navigation?.navigate(null);
      setThread(null);
      setFailure(null);
    }
  }

  const { sendMessage, fork } = messageActions({ client, thread, setThread, perform, record,
    onBranch(id, branch) {
      if (navigation && navigation.request() === routeRequest) navigation.navigate(id, true, branch);
    },
    onCreated(id) {
      if (navigation && navigation.request() === routeRequest) {
        navigation.navigate(id);
      }
    },
    setFailure, refreshList, transferDraft: drafts.transfer, clearDraft: drafts.clear,
  });

  const { addProfile, queueRun } = executionActions({ client, perform, record, thread, profileId,
    draftKey, setThread, setProfiles, setProfileId, setQueuedFor,
  });
  const { readChanges, readChangesInBackground } = syncActions({
    client, perform, performBackground, record, archived, query, thread,
    setPage, setThread, setProfiles, ...diagnostics,
  });
  const hasActiveRun = thread?.runs.some(
    (run) => run.status === "queued" || run.status === "running",
  ) ?? false;
  function syncActiveRouteInBackground() {
    const requestedRoute = navigation?.request();
    if (navigation && requestedRoute !== routeRequest)
      return Promise.resolve(false);
    return readChangesInBackground(
      () => !navigation || navigation.request() === requestedRoute,
    );
  }
  useRunAutoSync(
    connected && !pending && hasActiveRun,
    syncActiveRouteInBackground,
    supersedeBackground,
  );

  return {
    draft: pending ? "" : draft,
    setDraft: (value: string) => {
      if (!navigation || (!pending && navigation.request() === routeRequest)) setDraft(value);
    },
    queuedNotice: queuedFor === draftKey,
    token,
    connected,
    busy: busy || (connected && pending),
    failure,
    page,
    archived,
    query,
    thread: pending ? null : thread,
    profiles,
    profileId,
    cursor,
    changes,
    hasMoreChanges,
    lastStatus,
    lastResponse,
    setProfileId,
    connect,
    disconnect,
    newChat,
    selectConversation: async (id: string, branch = "") => {
      const ok = await selectThread(id, branch);
      if (ok && navigation && navigation.request() === routeRequest && navigation.id === id && branch) navigation.navigate(id, true, branch);
      return ok;
    },
    search,
    loadMore,
    refresh,
    changeConversation,
    sendMessage,
    fork,
    addProfile,
    queueRun,
    readChanges,
    dismissError: () => setFailure(null),
  };
}

export type Workspace = ReturnType<typeof useWorkspace>;
