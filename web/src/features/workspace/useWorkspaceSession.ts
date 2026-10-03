import { useEffect, useState } from "react";
import { createClient } from "../../api/client";
import { listConversations } from "../../api/conversations";
import { listProfiles } from "../../api/runs";
import { ApiError, type ConversationPage, type Profile } from "../../api/types";
import { loadSession, saveSession, type SavedSession } from "../../storage/session";
import { describeError } from "./errors";
import { loadThread } from "./loadThread";
import type { Failure, Thread } from "./types";

export function useWorkspaceSession(saved: SavedSession, thread: Thread | null, cursor: number,
  onRestore: (page: ConversationPage, profiles: Profile[], thread: Thread | null) => void,
  onFailure: (failure: Failure) => void, onRelease: () => void, routed = false, pending = false) {
  const [token, setToken] = useState(saved.token);
  const [connected, setConnected] = useState(false);
  const client = createClient(() => token);
  useEffect(() => {
    if (pending || (token && !connected)) return;
    saveSession({
      token,
      conversationId: thread?.conversation.id ?? "",
      branchId: thread?.branch.id ?? "",
      cursor,
    });
  }, [token, connected, thread?.conversation.id, thread?.branch.id, cursor, pending]);

  useEffect(() => {
    if (!saved.token) return;
    let cancelled = false;
    const initialClient = createClient(() => saved.token);
    Promise.all([listConversations(initialClient), listProfiles(initialClient)])
      .then(async ([conversations, profileList]) => {
        let restored: Thread | null = null;
        if (!routed && saved.conversationId) {
          try {
            restored = await loadThread(
              initialClient,
              saved.conversationId,
              saved.branchId,
            );
          } catch (error) {
            if (!(error instanceof ApiError && error.status === 404))
              throw error;
          }
        }
        if (cancelled) return;
        onRestore(conversations.data, profileList.data.profiles, restored);
        setConnected(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) onFailure(describeError(error));
      })
      .finally(() => {
        if (!cancelled) {
          onRelease();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [saved, onRestore, onFailure, onRelease, routed]);


  return { token, setToken, connected, setConnected, client };
}

export function useWorkspaceSnapshot() {
  const [saved] = useState(loadSession);
  return saved;
}
