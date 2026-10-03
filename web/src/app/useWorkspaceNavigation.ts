import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { Client } from "../api/client";
import type { SavedSession } from "../storage/session";
import type { Thread } from "../features/workspace/types";
import type { Operation } from "../features/workspace/useWorkspaceOperation";
import { loadThread } from "../features/workspace/loadThread";
import { describeError } from "../features/workspace/errors";
import { useRouter, useRouterState } from "@tanstack/react-router";

export type WorkspaceNavigation = {
  id: string | null;
  invalid: boolean;
  branch: string;
  request: () => string;
  locationRequest: string;
  navigate: (id: string | null, replace?: boolean, branch?: string) => void;
  selectConversation: (id: string) => Promise<boolean>;
};
export function useWorkspaceNavigation(): WorkspaceNavigation {
  const router = useRouter();
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const location = useRouterState({ select: (state) => state.location });
  // Match the encoded href with the declared route tree. The router's display
  // pathname is partially decoded; decoding it again corrupts opaque IDs.
  let id: string | null = null;
  try {
    const pathname = new URL(location.href, router.origin).pathname;
    const [, params, route] = router.getMatchedRoutes(pathname);
    if (route?.fullPath === "/chat/$conversationId" && params["**"] === undefined)
      id = params.conversationId || null;
  } catch {
    // Malformed percent escapes are handled by the accessible recovery path.
  }
  function navigate(id: string | null, replace = false, branch = "") {
    if (!alive.current) return;
    const pathname = id ? `/chat/${encodeURIComponent(id)}` : "/";
    if (!replace && router.history.location.pathname === pathname) return;
    void router.navigate(id ? { to: "/chat/$conversationId", params: { conversationId: id }, replace, state: { workspaceBranch: branch } } : { to: "/", replace });
  }
  return {
    locationRequest: location.state.__TSR_key ?? location.href,
    id, invalid: location.pathname !== "/" && !id,
    branch: location.state.workspaceBranch ?? "",
    request: () => router.history.location.state.__TSR_key ?? router.history.location.href,
    navigate,
    selectConversation: async (id) => { navigate(id); return true; },
  };
}

// Route reads use the same synchronous gate as all workspace workflows.
export function useWorkspaceRoute({ navigation, connected, operation, thread, setThread, saved, client, initialRequest }: {
  navigation?: WorkspaceNavigation;
  connected: boolean;
  operation: Operation;
  thread: Thread | null;
  setThread: Dispatch<SetStateAction<Thread | null>>;
  saved: SavedSession;
  client: Client;
  initialRequest?: string;
}) {
  const { busy, actionRunning, perform: rawPerform, setFailure } = operation;
  const target = navigation?.id ?? null;
  const lifetime = useRef(0);
  useEffect(() => () => { lifetime.current++; }, []);
  useEffect(() => {
    if (!navigation || busy || actionRunning.current) return;
    let cancelled = false;
    // Defer only the external route intent; cleanup cancels obsolete scheduling.
    queueMicrotask(() => {
      if (cancelled || actionRunning.current || navigation.request() !== navigation.locationRequest) return;
      const requested = navigation.request();
      const generation = lifetime.current;
      const current = () => lifetime.current === generation && navigation.request() === requested;
      if (navigation.invalid) {
        setFailure({ message: "Ubicación no válida.", status: null, code: null, details: null });
        navigation.navigate(thread?.conversation.id ?? null, true, thread?.branch.id);
        return;
      }
      if (!connected) return;
      if ((thread?.conversation.id ?? null) === target &&
          (!navigation.branch || navigation.branch === thread?.branch.id)) return;
      if (!target) {
        setThread(null);
        return;
      }
      void rawPerform(async () => {
        try {
          const branch = navigation.branch || (saved.conversationId === target && requested === initialRequest ? saved.branchId : "");
          const next = await loadThread(client, target, branch);
          if (!current()) return;
          setThread(next);
          navigation.navigate(target, true, next.branch.id);
        } catch (error) {
          if (!current()) return;
          const detail = describeError(error);
          setFailure(detail.status === 404 ? { ...detail, message: `No se encontró la conversación. ${detail.message}` } : detail);
          navigation.navigate(thread?.conversation.id ?? null, true, thread?.branch.id);
        }
      });
    });
    return () => { cancelled = true; };
  }, [navigation, connected, busy, actionRunning, initialRequest, target, thread, rawPerform, setFailure, setThread, saved, client]);
}
