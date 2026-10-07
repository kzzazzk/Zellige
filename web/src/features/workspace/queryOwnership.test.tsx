import { act, renderHook, waitFor } from "@testing-library/react";
import { focusManager, onlineManager } from "@tanstack/react-query";
import type { SetStateAction } from "react";
import { describe, expect, it, vi } from "vitest";
import { createClient } from "../../api/client";
import { createConversation } from "../../api/conversations";
import type { ConversationPage, Profile } from "../../api/types";
import { loadSession, saveSession } from "../../storage/session";
import { apiFixture } from "../../test/apiFixture";
import { createQueryWrapper } from "../../test/queryWrapper";
import { useWorkspace } from "../useWorkspace";
import { workspaceKeys } from "./queryKeys";
import type { Thread } from "./types";
import { syncActions } from "./syncActions";
import { useWorkspaceServerState } from "./useWorkspaceServerState";
import { loadThread } from "./loadThread";

async function setup() {
  const api = apiFixture();
  const provider = createQueryWrapper();
  const hook = renderHook(useWorkspace, provider);
  await act(async () => { expect(await hook.result.current.connect("secret")).toBe(true); });
  return { api, ...provider, ...hook };
}

describe("Query cache ownership", () => {
  it("renders cache writes and removals directly, with one composed authoritative thread entry", async () => {
    const { api, result, queryClient } = await setup();
    await act(async () => { await result.current.sendMessage("canonical"); });
    await act(async () => { await result.current.addProfile("Profile", "manual"); });
    await act(async () => { await result.current.queueRun(); });
    const thread = result.current.thread!;
    const key = workspaceKeys.thread(thread.conversation.id, thread.branch.id);
    expect(queryClient.getQueryData(key)).toBe(thread);
    expect(queryClient.getQueryData(workspaceKeys.profiles)).toBe(result.current.profiles);
    expect(queryClient.getQueryData(workspaceKeys.conversations(false, ""))).toBe(result.current.page);
    expect(queryClient.getQueryCache().getAll().map((entry) => entry.queryKey)).toEqual([
      workspaceKeys.conversations(false, ""), workspaceKeys.profiles, key,
    ]);
    act(() => {
      queryClient.setQueryData<Thread>(key, { ...thread, conversation: { ...thread.conversation, title: "Cache edit" } });
      queryClient.setQueryData<ConversationPage>(workspaceKeys.conversations(false, ""), { conversations: [], has_more: true });
      queryClient.setQueryData<Profile[]>(workspaceKeys.profiles, []);
    });
    expect(result.current.thread?.conversation.title).toBe("Cache edit");
    expect(result.current.page).toEqual({ conversations: [], has_more: true });
    expect(result.current.profiles).toEqual([]);
    expect(api.runs).toHaveLength(1);
    act(() => queryClient.removeQueries({ queryKey: workspaceKeys.all }));
    expect(result.current.thread).toBeNull();
    expect(result.current.page).toEqual({ conversations: [], has_more: false });
    expect(result.current.profiles).toEqual([]);
  });

  it.each(["", "missing-branch"])("adopts the first authoritative branch for hint %j without caching aliases", async (hint) => {
    const { result, queryClient } = await setup();
    await act(async () => { await result.current.sendMessage("first"); });
    act(() => result.current.newChat());
    await act(async () => { expect(await result.current.selectConversation("conv-1", hint)).toBe(true); });
    expect(result.current.thread?.branch.id).toBe("branch-1");
    expect(queryClient.getQueryData(workspaceKeys.thread("conv-1", hint))).toBeUndefined();
    expect(queryClient.getQueryData(workspaceKeys.thread("conv-1", "branch-1"))).toBe(result.current.thread);
    expect(loadSession().branchId).toBe("branch-1");
  });

  it("keeps submitted filters in separate cache entries and aggregates offset reads in the selected entry", async () => {
    const { api, result, queryClient } = await setup();
    await act(async () => { await result.current.sendMessage("Alpha"); });
    const firstPage = result.current.page;
    await act(async () => { await result.current.search("Alpha"); });
    const filteredKey = workspaceKeys.conversations(false, "Alpha");
    expect(queryClient.getQueryData(filteredKey)).toBe(result.current.page);
    expect(queryClient.getQueryData(workspaceKeys.conversations(false, ""))).toBe(firstPage);
    api.fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      conversations: [firstPage.conversations[0], { ...firstPage.conversations[0], id: "second" }], has_more: false,
    }), { status: 200 }));
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.page.conversations.map((entry) => entry.id)).toEqual(["conv-1", "second"]);
    expect(queryClient.getQueryData(filteredKey)).toBe(result.current.page);
    expect(queryClient.getQueryData(workspaceKeys.conversations(false, ""))).toBe(firstPage);
    expect(queryClient.getQueryCache().findAll({ queryKey: ["workspace", "conversations"] })).toHaveLength(2);
  });

  it("preserves all cached entries on failed reconnect, then removes them only after successful session reads", async () => {
    const { api, result, queryClient } = await setup();
    await act(async () => { await result.current.sendMessage("Previous session"); });
    await act(async () => { await result.current.addProfile("Previous profile", "manual"); });
    await act(async () => { await result.current.search("Previous", true); });
    act(() => result.current.setDraft("retained"));
    const selected = result.current.thread;
    const before = queryClient.getQueriesData({ queryKey: workspaceKeys.all });
    await act(async () => { expect(await result.current.connect("wrong")).toBe(false); });
    for (const [key, value] of before) expect(queryClient.getQueryData(key)).toBe(value);
    expect(result.current.thread).toBe(selected);
    expect(result.current.draft).toBe("retained");
    expect(result.current.profileId).not.toBe("");

    const original = api.fetchMock.getMockImplementation()!;
    api.fetchMock.mockImplementation((path, options) => {
      const headers = new Headers(options?.headers);
      if (headers.get("Authorization") === "Bearer next-session") headers.set("Authorization", "Bearer secret");
      return original(path, { ...options, headers });
    });
    const pending = api.deferNext("GET", "/v1/runtime-profiles");
    let connection!: Promise<boolean>;
    await act(async () => { connection = result.current.connect("next-session"); await pending.requested; });
    expect(result.current.token).toBe("secret");
    for (const [key, value] of before) expect(queryClient.getQueryData(key)).toBe(value);
    await act(async () => { pending.release(); expect(await connection).toBe(true); });
    expect(result.current.token).toBe("next-session");
    expect(result.current.thread).toBeNull();
    expect(result.current.draft).toBe("");
    expect(result.current.profileId).toBe("");
    expect(result.current.archived).toBe(false);
    expect(result.current.query).toBe("");
    expect(queryClient.getQueryCache().getAll().map((entry) => entry.queryKey)).toEqual([
      workspaceKeys.conversations(false, ""), workspaceKeys.profiles,
    ]);
    expect(queryClient.getQueryData(workspaceKeys.conversations(false, ""))).toBe(result.current.page);
    expect(queryClient.getQueryData(workspaceKeys.profiles)).toBe(result.current.profiles);
  });

  it("disconnect removes every workspace entry and resets drafts while retaining the archived filter", async () => {
    const { result, queryClient } = await setup();
    await act(async () => { await result.current.sendMessage("Cached"); });
    await act(async () => { await result.current.addProfile("Profile", "manual"); });
    await act(async () => { await result.current.search("Cached", true); });
    act(() => result.current.setDraft("reset"));
    queryClient.setQueryData(["other-feature"], "retained");
    act(() => result.current.disconnect());
    expect(queryClient.getQueryCache().findAll({ queryKey: workspaceKeys.all })).toEqual([]);
    expect(queryClient.getQueryData(["other-feature"])).toBe("retained");
    expect(result.current.thread).toBeNull();
    expect(result.current.page).toEqual({ conversations: [], has_more: false });
    expect(result.current.profiles).toEqual([]);
    expect(result.current.profileId).toBe("");
    expect(result.current.archived).toBe(true);
    expect(result.current.query).toBe("");
    expect(result.current.draft).toBe("");
    await act(async () => { await result.current.connect("secret"); });
    expect(result.current.thread).toBeNull();
    expect(result.current.archived).toBe(false);
  });

  it("stages bootstrap before populating the cache and persists only session identity and cursor", async () => {
    const api = apiFixture();
    await createConversation(createClient(() => "secret"), "Saved");
    const saved = { token: "secret", conversationId: "conv-1", branchId: "branch-1", cursor: 17 };
    saveSession(saved);
    const provider = createQueryWrapper();
    const pending = api.deferNext("GET", "/v1/conversations/conv-1/branches/branch-1/history");
    const { result } = renderHook(useWorkspace, provider);
    await act(async () => { await pending.requested; });
    expect(provider.queryClient.getQueryCache().getAll()).toEqual([]);
    expect(loadSession()).toEqual(saved);
    await act(async () => { pending.release(); });
    await waitFor(() => expect(result.current.connected).toBe(true));
    expect(provider.queryClient.getQueryData(workspaceKeys.thread("conv-1", "branch-1"))).toBe(result.current.thread);
    expect(loadSession()).toEqual(saved);
    expect(sessionStorage.length).toBe(1);
    expect(Object.keys(loadSession()).sort()).toEqual(["branchId", "conversationId", "cursor", "token"]);
  });

  it("does not fetch on mount, focus, reconnect, cache writes or remount, and isolates test clients", async () => {
    const { api, result, queryClient, wrapper, unmount } = await setup();
    await act(async () => { await result.current.sendMessage("Shared only within this provider"); });
    const provider = createQueryWrapper();
    const isolated = renderHook(useWorkspace, provider);
    await waitFor(() => expect(isolated.result.current.connected).toBe(true));
    const otherPage = isolated.result.current.page;
    const cachedPage = result.current.page;
    act(() => queryClient.setQueryData(workspaceKeys.conversations(false, ""), { conversations: [], has_more: false }));
    expect(isolated.result.current.page).toBe(otherPage);
    expect(provider.queryClient.getQueryData(workspaceKeys.conversations(false, ""))).toBe(otherPage);
    expect(result.current.page).not.toBe(cachedPage);
    api.fetchMock.mockClear();
    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    });
    expect(api.fetchMock).not.toHaveBeenCalled();
    // Remount the cache adapter alone: bootstrap is a separate intentional read.
    unmount();
    renderHook(useWorkspaceServerState, { wrapper });
    expect(api.fetchMock).not.toHaveBeenCalled();
    focusManager.setFocused(undefined);
  });

  it("commits all sync cache values and diagnostics before acknowledging the cursor", async () => {
    const api = apiFixture();
    const client = createClient(() => "secret");
    await createConversation(client, "Authoritative");
    const initialThread = await loadThread(client, "conv-1", "branch-1");
    const provider = createQueryWrapper();
    const { result } = renderHook(useWorkspaceServerState, provider);
    act(() => result.current.setThread(initialThread));
    api.branches[0].name = "Authoritative refreshed branch";
    api.fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      changes: [{ seq: 12, conversation_id: null, entity_type: "future", entity_id: "signal",
        operation: "upsert", changed_at: 1, data: { title: "Untrusted" } }],
      next_cursor: 12, has_more: false,
    }), { status: 200 }));
    const changes = vi.fn();
    const hasMore = vi.fn();
    const cursor = vi.fn((next: SetStateAction<number>) => {
      expect(next).toBe(12);
      expect(provider.queryClient.getQueryData<ConversationPage>(workspaceKeys.conversations(false, ""))?.conversations[0].title).toBe("Authoritative");
      expect(provider.queryClient.getQueryData(workspaceKeys.profiles)).toEqual([]);
      expect(provider.queryClient.getQueryData<Thread>(workspaceKeys.thread("conv-1", "branch-1"))?.branch.name).toBe("Authoritative refreshed branch");
      expect(changes).toHaveBeenCalledOnce();
      expect(hasMore).toHaveBeenCalledWith(false);
    });
    const { readChanges } = syncActions({ ...result.current, client, cursor: 11,
      perform: async (action) => { await action(); return true; },
      performBackground: async (action) => { await action(() => true); return true; },
      record: (response) => response.data,
      setChanges: changes, setHasMoreChanges: hasMore, setCursor: cursor,
    });
    await act(async () => { expect(await readChanges()).toBe(true); });
    expect(cursor).toHaveBeenCalledOnce();
  });
});
