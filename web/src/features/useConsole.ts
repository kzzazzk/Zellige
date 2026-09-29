import { useCallback, useEffect, useState } from "react";
import { createClient } from "../api/client";
import { getChanges } from "../api/changes";
import { appendMessage, createConversation, getHistory } from "../api/conversations";
import { getHealth } from "../api/health";
import { createProfile, createRun } from "../api/runs";
import { ApiError, type Change, type Item, type Run } from "../api/types";
import { loadSession, saveSession } from "../storage/session";

type Failure = { message: string; status: number | null; code: string | null; details: Record<string, unknown> | null };

function failureOf(error: unknown): Failure {
  return error instanceof ApiError
    ? { message: error.message, status: error.status, code: error.code, details: error.details }
    : { message: "Ha ocurrido un error inesperado.", status: null, code: null, details: null };
}

export function useConsole() {
  const [saved] = useState(loadSession);
  const [token, setToken] = useState(saved.token);
  const [conversationId, setConversationId] = useState(saved.conversationId);
  const [branchId, setBranchId] = useState(saved.branchId);
  const [cursor, setCursor] = useState(saved.cursor);
  const [health, setHealth] = useState<"checking" | "ok" | "offline">("checking");
  const [items, setItems] = useState<Item[]>([]);
  const [headItemId, setHeadItemId] = useState<string | null>(null);
  const [profileVersionId, setProfileVersionId] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [changes, setChanges] = useState<Change[]>([]);
  const [hasMoreChanges, setHasMoreChanges] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [lastStatus, setLastStatus] = useState<number | null>(null);
  const [lastResponse, setLastResponse] = useState<unknown>(null);

  useEffect(() => {
    saveSession({ token, conversationId, branchId, cursor });
  }, [token, conversationId, branchId, cursor]);

  const client = createClient(() => token);

  const checkHealth = useCallback(async () => {
    setHealth("checking");
    try {
      const result = await getHealth(createClient(() => ""));
      setHealth(result.data.status === "ok" && result.data.database === "ok" ? "ok" : "offline");
    } catch {
      setHealth("offline");
    }
  }, []);

  const applyHistory = useCallback(async (id: string, branch: string) => {
    const result = await getHistory(createClient(() => token), id, branch);
    setItems(result.data.items);
    setHeadItemId(result.data.branch.head_item_id);
    setLastStatus(result.status);
    setLastResponse(result.data);
    return result;
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    getHealth(createClient(() => ""))
      .then((result) => {
        if (!cancelled) setHealth(result.data.status === "ok" && result.data.database === "ok" ? "ok" : "offline");
      })
      .catch(() => { if (!cancelled) setHealth("offline"); });
    return () => { cancelled = true; };
  }, []);

  // Restore canonical head from the server, never from browser storage.
  useEffect(() => {
    if (!saved.token || !saved.conversationId || !saved.branchId) return;
    let cancelled = false;
    getHistory(createClient(() => saved.token), saved.conversationId, saved.branchId)
      .then((result) => {
        if (cancelled) return;
        setItems(result.data.items);
        setHeadItemId(result.data.branch.head_item_id);
        setLastStatus(result.status);
        setLastResponse(result.data);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const next = failureOf(error);
        setFailure(next);
        setLastStatus(next.status);
      });
    return () => { cancelled = true; };
  }, [saved]);

  async function execute(action: () => Promise<void>) {
    setBusy(true);
    setFailure(null);
    try { await action(); }
    catch (error) {
      const next = failureOf(error);
      setFailure(next);
      setLastStatus(next.status);
      setLastResponse({ error: { code: next.code, message: next.message, details: next.details } });
    }
    finally { setBusy(false); }
  }

  function openExisting(id: string, branch: string) {
    return execute(async () => {
      if (!id.trim() || !branch.trim()) throw new ApiError("Introduce ambos IDs.", null);
      await applyHistory(id.trim(), branch.trim());
      setConversationId(id.trim());
      setBranchId(branch.trim());
      setRun(null);
    });
  }

  function newConversation(title: string) {
    return execute(async () => {
      const result = await createConversation(client, title.trim() || "New conversation");
      setConversationId(result.data.conversation.id);
      setBranchId(result.data.branch.id);
      setItems([]);
      setHeadItemId(result.data.branch.head_item_id);
      setRun(null);
      setLastStatus(result.status);
      setLastResponse(result.data);
    });
  }

  function refreshHistory() {
    return execute(async () => {
      if (!conversationId || !branchId) throw new ApiError("Abre una conversación primero.", null);
      await applyHistory(conversationId, branchId);
    });
  }

  async function sendMessage(text: string): Promise<boolean> {
    if (!conversationId || !branchId || !text.trim()) return false;
    setBusy(true);
    setFailure(null);
    try {
      const result = await appendMessage(client, conversationId, branchId, headItemId, text.trim());
      setItems((current) => [...current, result.data]);
      setHeadItemId(result.data.id);
      setLastStatus(result.status);
      setLastResponse(result.data);
      return true;
    } catch (error) {
      const next = failureOf(error);
      setFailure(next);
      setLastStatus(next.status);
      setLastResponse({ error: { code: next.code, message: next.message, details: next.details } });
      if (next.status === 409 && next.code === "head_conflict") {
        try { await applyHistory(conversationId, branchId); }
        catch { /* Keep the conflict visible; the user can refresh manually. */ }
      }
      return false;
    } finally { setBusy(false); }
  }

  function newProfile(name: string) {
    return execute(async () => {
      const result = await createProfile(client, name.trim());
      setProfileVersionId(result.data.version.id);
      setLastStatus(result.status);
      setLastResponse(result.data);
    });
  }

  function newRun(versionId: string) {
    return execute(async () => {
      if (!conversationId || !branchId) throw new ApiError("Abre una conversación primero.", null);
      const result = await createRun(client, conversationId, branchId, versionId.trim());
      setRun(result.data);
      setLastStatus(result.status);
      setLastResponse(result.data);
    });
  }

  function readChanges() {
    return execute(async () => {
      const result = await getChanges(client, cursor);
      setChanges(result.data.changes);
      setCursor(result.data.next_cursor);
      setHasMoreChanges(result.data.has_more);
      setLastStatus(result.status);
      setLastResponse(result.data);
    });
  }

  return {
    token, setToken, conversationId, branchId, headItemId, items, health, busy, failure,
    lastStatus, lastResponse, profileVersionId, run, changes, cursor, hasMoreChanges,
    checkHealth, openExisting, newConversation, refreshHistory, sendMessage,
    newProfile, newRun, readChanges,
  };
}
