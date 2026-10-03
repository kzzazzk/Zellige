import { useCallback } from "react";
import type { ConversationPage, Profile } from "../api/types";
import { draftKey as getDraftKey } from "./workspace/draftKey";
import type { Thread } from "./workspace/types";
import { useWorkspaceSnapshot, useWorkspaceSession } from "./workspace/useWorkspaceSession";
import { useWorkspaceOperation } from "./workspace/useWorkspaceOperation";
import { useDrafts } from "./workspace/useDrafts";
import { useConversationState } from "./workspace/useConversationState";
import { conversationActions } from "./workspace/conversationActions";
import { connectionActions } from "./workspace/connectionActions";
import { messageActions } from "./workspace/messageActions";
import { useExecutionState } from "./workspace/useExecutionState";
import { executionActions } from "./workspace/executionActions";
import { useDiagnostics } from "./workspace/useDiagnostics";

export type { Thread } from "./workspace/types";

export function useWorkspace() {
  const saved = useWorkspaceSnapshot();
  const operation = useWorkspaceOperation(!!saved.token);
  const { busy, failure, lastResponse, lastStatus, actionRunning, record, perform, setFailure, setLastResponse, setLastStatus, releaseBootstrap } = operation;
  const { page, setPage, archived, setArchived, query, setQuery, thread, setThread } = useConversationState();
  const draftKey = getDraftKey(thread);
  const drafts = useDrafts(draftKey);
  const { draft, setDraft } = drafts;
  const { profiles, setProfiles, profileId, setProfileId, queuedFor, setQueuedFor } = useExecutionState();
  const diagnostics = useDiagnostics(saved.cursor);
  const { cursor, setCursor, changes, setChanges, hasMoreChanges } = diagnostics;
  const restore = useCallback((page: ConversationPage, profiles: Profile[], thread: Thread | null) => {
    setPage(page);
    setProfiles(profiles);
    setThread(thread);
  }, [setPage, setProfiles, setThread]);
  const { token, setToken, connected, setConnected, client } = useWorkspaceSession(
    saved, thread, cursor, restore, setFailure, releaseBootstrap,
  );

  const { refreshList, selectConversation, search, loadMore, refresh, changeConversation } = conversationActions({
    client, perform, record, page, setPage, archived, setArchived, query, setQuery, thread, setThread, setProfiles,
  });
  const { connect } = connectionActions({ perform, record, setPage, setProfiles,
    onConnected(next) {
      setToken(next);
      drafts.reset();
      setQueuedFor(null);
      setConnected(true);
      setThread(null);
      setArchived(false);
      setQuery("");
      setProfileId("");
    },
  });

  function disconnect() {
    if (actionRunning.current) return;
    drafts.reset();
    setQueuedFor(null);
    setToken("");
    setConnected(false);
    setThread(null);
    setProfiles([]);
    setProfileId("");
    setPage({ conversations: [], has_more: false });
    setFailure(null);
    setLastResponse(null);
    setChanges([]);
    setCursor(0);
    setLastStatus(null);
    setQuery("");
  }

  function newChat() {
    if (!actionRunning.current) {
      setThread(null);
      setFailure(null);
    }
  }

  const { sendMessage, fork } = messageActions({ client, thread, setThread, perform, record,
    setFailure, refreshList, transferDraft: drafts.transfer, clearDraft: drafts.clear,
  });

  const { addProfile, queueRun } = executionActions({ client, perform, record, thread, profileId,
    draftKey, setThread, setProfiles, setProfileId, setQueuedFor,
  });
  const { readChanges } = diagnostics.actions(client, operation);

  return {
    draft,
    setDraft,
    queuedNotice: queuedFor === draftKey,
    token,
    connected,
    busy,
    failure,
    page,
    archived,
    query,
    thread,
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
    selectConversation,
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
