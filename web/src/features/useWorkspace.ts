import { useEffect, useRef, useState } from "react";
import { createClient, type Client } from "../api/client";
import {
  appendMessage,
  createBranch,
  createConversation,
  getConversation,
  getHistory,
  listBranches,
  listConversations,
  updateConversation,
} from "../api/conversations";
import { createProfile, createRun, listProfiles, listRuns } from "../api/runs";
import { getChanges } from "../api/changes";
import {
  ApiError,
  type ApiResult,
  type Branch,
  type Change,
  type Conversation,
  type ConversationPage,
  type Item,
  type Profile,
  type Run,
} from "../api/types";
import { loadSession, saveSession } from "../storage/session";

export type Thread = {
  conversation: Conversation;
  branches: Branch[];
  branch: Branch;
  items: Item[];
  runs: Run[];
};
type Failure = {
  message: string;
  status: number | null;
  code: string | null;
  details: unknown;
};

function describeError(error: unknown): Failure {
  if (!(error instanceof ApiError))
    return {
      message: "No se pudo completar la operación. Vuelve a intentarlo.",
      status: null,
      code: null,
      details: null,
    };
  const messages: Record<string, string> = {
    unauthorized: "La clave de acceso no es válida. Revísala en Ajustes.",
    already_exists:
      "Ya existe un perfil o un nombre igual. Prueba con otro nombre.",
    head_conflict:
      "La conversación ha cambiado en otro dispositivo. Revisa el historial y vuelve a enviar tu borrador.",
    conversation_conflict:
      "La conversación ha cambiado. Actualízala antes de guardar de nuevo.",
    invalid_branch: "No se pudo crear la rama. Usa un nombre distinto.",
  };
  return {
    message: messages[error.code ?? ""] ?? error.message,
    status: error.status,
    code: error.code,
    details: error.details,
  };
}

async function loadThread(
  client: Client,
  conversationId: string,
  branchId = "",
): Promise<Thread> {
  const [conversation, branches, runs] = await Promise.all([
    getConversation(client, conversationId),
    listBranches(client, conversationId),
    listRuns(client, conversationId),
  ]);
  const branch =
    branches.data.branches.find((entry) => entry.id === branchId) ??
    branches.data.branches[0];
  if (!branch) throw new ApiError("Esta conversación no tiene ramas.", 404);
  const history = await getHistory(client, conversationId, branch.id);
  return {
    conversation: conversation.data,
    branches: branches.data.branches,
    branch: history.data.branch,
    items: history.data.items,
    runs: runs.data.runs,
  };
}

export function useWorkspace() {
  const [saved] = useState(loadSession);
  const [token, setToken] = useState(saved.token);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(!!saved.token);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [page, setPage] = useState<ConversationPage>({
    conversations: [],
    has_more: false,
  });
  const [archived, setArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [thread, setThread] = useState<Thread | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [queuedFor, setQueuedFor] = useState<string | null>(null);
  const draftKey = thread
    ? JSON.stringify([thread.conversation.id, thread.branch.id])
    : "new";
  const draft = drafts[draftKey] ?? "";
  function setDraft(value: string) {
    setDrafts((current) => ({ ...current, [draftKey]: value }));
  }
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState("");
  const [cursor, setCursor] = useState(saved.cursor);
  const [changes, setChanges] = useState<Change[]>([]);
  const [hasMoreChanges, setHasMoreChanges] = useState(false);
  const [lastResponse, setLastResponse] = useState<unknown>(null);
  const [lastStatus, setLastStatus] = useState<number | null>(null);
  const actionRunning = useRef(!!saved.token);
  const client = createClient(() => token);

  useEffect(() => {
    if (token && !connected) return;
    saveSession({
      token,
      conversationId: thread?.conversation.id ?? "",
      branchId: thread?.branch.id ?? "",
      cursor,
    });
  }, [token, connected, thread?.conversation.id, thread?.branch.id, cursor]);

  useEffect(() => {
    if (!saved.token) return;
    let cancelled = false;
    const initialClient = createClient(() => saved.token);
    Promise.all([listConversations(initialClient), listProfiles(initialClient)])
      .then(async ([conversations, profileList]) => {
        let restored: Thread | null = null;
        if (saved.conversationId) {
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
        setPage(conversations.data);
        setProfiles(profileList.data.profiles);
        setThread(restored);
        setConnected(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) setFailure(describeError(error));
      })
      .finally(() => {
        if (!cancelled) {
          actionRunning.current = false;
          setBusy(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [saved]);

  function record<T>(result: ApiResult<T>): T {
    setLastStatus(result.status);
    setLastResponse(result.data);
    return result.data;
  }

  async function perform(action: () => Promise<void>): Promise<boolean> {
    if (actionRunning.current) return false;
    actionRunning.current = true;
    setBusy(true);
    setFailure(null);
    try {
      await action();
      return true;
    } catch (error) {
      const detail = describeError(error);
      setFailure(detail);
      setLastStatus(detail.status);
      setLastResponse({ error: detail });
      return false;
    } finally {
      actionRunning.current = false;
      setBusy(false);
    }
  }

  async function refreshList() {
    setPage(record(await listConversations(client, archived, query)));
  }

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
      setToken(next);
      setDrafts({});
      setQueuedFor(null);
      setConnected(true);
      setThread(null);
      setArchived(false);
      setQuery("");
      setPage(record(conversations));
      setProfiles(profileList.data.profiles);
      setProfileId("");
    });
  }

  function disconnect() {
    if (actionRunning.current) return;
    setDrafts({});
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

  function selectConversation(id: string, branchId = "") {
    return perform(async () => {
      setThread(await loadThread(client, id, branchId));
    });
  }

  function search(value: string, showArchived = archived) {
    return perform(async () => {
      setPage(record(await listConversations(client, showArchived, value)));
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

  function sendMessage(text: string) {
    return perform(async () => {
      if (!text.trim()) throw new ApiError("Escribe un mensaje primero.", null);
      let active = thread;
      if (!active) {
        const created = record(
          await createConversation(client, text.trim().slice(0, 80)),
        );
        active = {
          conversation: created.conversation,
          branches: [created.branch],
          branch: created.branch,
          items: [],
          runs: [],
        };
        setThread(active);
        const createdKey = JSON.stringify([
          active.conversation.id,
          active.branch.id,
        ]);
        setDrafts((current) => ({ ...current, new: "", [createdKey]: text }));
      }
      const target = active;
      try {
        const item = record(
          await appendMessage(
            client,
            target.conversation.id,
            target.branch.id,
            target.branch.head_item_id,
            text.trim(),
          ),
        );
        setThread({
          ...target,
          branch: { ...target.branch, head_item_id: item.id },
          items: [...target.items, item],
        });
        const savedKey = JSON.stringify([
          target.conversation.id,
          target.branch.id,
        ]);
        setDrafts((current) => ({ ...current, [savedKey]: "" }));
      } catch (error) {
        if (error instanceof ApiError && error.code === "head_conflict") {
          try {
            setThread(
              await loadThread(
                client,
                target.conversation.id,
                target.branch.id,
              ),
            );
          } catch {
            /* The original conflict remains visible; manual refresh is available. */
          }
        }
        throw error;
      }
      // The append succeeded; a failed follow-up read must not prompt a duplicate send.
      try {
        await refreshList();
        setThread(
          await loadThread(client, target.conversation.id, target.branch.id),
        );
      } catch {
        setFailure({
          message:
            "Mensaje guardado. No se pudo actualizar la lista; pulsa Actualizar.",
          status: null,
          code: null,
          details: null,
        });
      }
    });
  }

  function fork(name: string, parent: string | null, editedText?: string) {
    return perform(async () => {
      if (!thread) return;
      const branch = record(
        await createBranch(client, thread.conversation.id, name.trim(), parent),
      );
      setThread(await loadThread(client, thread.conversation.id, branch.id));
      if (editedText !== undefined) {
        record(
          await appendMessage(
            client,
            thread.conversation.id,
            branch.id,
            parent,
            editedText,
          ),
        );
        setThread(await loadThread(client, thread.conversation.id, branch.id));
      }
      await refreshList();
    });
  }

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

  function readChanges() {
    return perform(async () => {
      const result = record(await getChanges(client, cursor));
      setChanges(result.changes);
      setCursor(result.next_cursor);
      setHasMoreChanges(result.has_more);
    });
  }

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
