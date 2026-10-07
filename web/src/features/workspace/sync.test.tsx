import { createQueryWrapper } from "../../test/queryWrapper";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceNavigation } from "../../app/useWorkspaceNavigation";
import { createClient } from "../../api/client";
import { createConversation } from "../../api/conversations";
import { createProfile } from "../../api/runs";
import type { Change, Changes } from "../../api/types";
import { loadSession, saveSession } from "../../storage/session";
import { apiFixture } from "../../test/apiFixture";
import { useWorkspace } from "../useWorkspace";
import { useDiagnostics } from "./useDiagnostics";
import { workspaceKeys } from "./queryKeys";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" },
});
const change = (entity_type: string, conversation_id: string | null = "conv-1", seq = 12,
  operation: Change["operation"] = "upsert"): Change => ({
  seq, conversation_id, entity_type, entity_id: `entity-${seq}`, operation, changed_at: 1,
  data: { unrelated: "generic JSON", conversation_id: "untrusted", malformed: [] },
});
const page = (changes: Change[], next_cursor = 12, has_more = false): Changes => ({
  changes, next_cursor, has_more,
});
type Fixture = ReturnType<typeof apiFixture>;
function changesPages(api: Fixture, ...pages: (Changes | Response)[]) {
  const original = api.fetchMock.getMockImplementation()!;
  let index = 0;
  api.fetchMock.mockImplementation(async (path, options) => {
    if (!path.startsWith("/v1/changes?")) return original(path, options);
    const next = pages[index++];
    if (!next) throw new Error("Unexpected changes page");
    return next instanceof Response ? next : json(next);
  });
}
const cursors = (api: Fixture) => api.fetchMock.mock.calls
  .filter(([path]) => path.startsWith("/v1/changes?"))
  .map(([path]) => Number(new URL(path, "http://localhost").searchParams.get("cursor")));
function expectReads(api: Fixture, list: number, thread: number, profiles: number) {
  const paths = api.fetchMock.mock.calls.map(([path]) => path);
  expect(paths.filter((path) => path.startsWith("/v1/conversations?"))).toHaveLength(list);
  expect(paths.filter((path) => path === "/v1/conversations/conv-1")).toHaveLength(thread);
  expect(paths.filter((path) => path === "/v1/runtime-profiles")).toHaveLength(profiles);
}
async function setup(navigation?: WorkspaceNavigation) {
  const api = apiFixture();
  const client = createClient(() => "secret");
  await createConversation(client, "Alpha");
  await createConversation(client, "Beta");
  await createProfile(client, "Primary");
  saveSession({ token: "", conversationId: "", branchId: "", cursor: 11 });
  const provider = createQueryWrapper();
  const hook = renderHook(() => useWorkspace(navigation), provider);
  await act(async () => { expect(await hook.result.current.connect("secret")).toBe(true); });
  if (navigation) await waitFor(() => expect(hook.result.current.thread?.conversation.id).toBe("conv-1"));
  else await act(async () => { expect(await hook.result.current.selectConversation("conv-1")).toBe(true); });
  api.fetchMock.mockClear();
  return { api, client, queryClient: provider.queryClient, ...hook };
}

describe("manual cursor synchronization", () => {
  it("drains pages and coalesces invalidations into one authoritative refresh each", async () => {
    const { api, client, result } = await setup();
    api.conversations[0].title = "Updated Alpha";
    api.branches[0].name = "Updated main";
    await createProfile(client, "External profile");
    api.fetchMock.mockClear();
    const first = [change("item"), change("branch", "conv-1", 13)];
    const second = [change("run", "conv-1", 14), change("runtime_profile", null, 15),
      change("runtime_profile_version", null, 16), change("item", "conv-2", 17)];
    changesPages(api, page(first, 13, true), page(second, 17));
    await act(async () => { expect(await result.current.readChanges()).toBe(true); });
    expect(cursors(api)).toEqual([11, 13]);
    expectReads(api, 1, 1, 1);
    expect(result.current.page.conversations[0].title).toBe("Updated Alpha");
    expect(result.current.thread?.branch.name).toBe("Updated main");
    expect(result.current.profiles).toHaveLength(2);
    expect(result.current.changes).toEqual([...first, ...second]);
    expect(result.current.cursor).toBe(17);
    expect(loadSession().cursor).toBe(17);
    expect(result.current.hasMoreChanges).toBe(false);
  });

  it.each(["completed", "failed"] as const)("refreshes running and %s transitions only after manual synchronization", async (terminal) => {
    const { api, result } = await setup();
    await act(async () => { result.current.setProfileId(result.current.profiles[0].version.id); });
    await act(async () => { expect(await result.current.queueRun()).toBe(true); });
    expect(result.current.thread?.runs[0].status).toBe("queued");
    for (const [index, status] of (["running", terminal] as const).entries()) {
      api.runs[0].status = status;
      api.runs[0].result = status === "completed" ? { summary: "Done" }
        : status === "failed" ? { error: "Failed" } : null;
      expect(result.current.thread?.runs[0].status).not.toBe(status);
      changesPages(api, page([change("run", "conv-1", 12 + index)], 12 + index));
      await act(async () => { expect(await result.current.readChanges()).toBe(true); });
      expect(result.current.thread?.runs[0].status).toBe(status);
      expect(result.current.thread?.runs[0].result).toEqual(api.runs[0].result);
    }
  });

  it("refreshes the list for another conversation without replacing the selected thread", async () => {
    const { api, result } = await setup();
    const thread = result.current.thread;
    api.conversations[1].title = "Updated Beta";
    changesPages(api, page([change("item", "conv-2")]));
    await act(async () => { expect(await result.current.readChanges()).toBe(true); });
    expectReads(api, 1, 0, 0);
    expect(result.current.thread).toBe(thread);
    expect(result.current.page.conversations[1].title).toBe("Updated Beta");
  });

  it.each(["item", "branch", "run"])("refreshes the selected thread for %s metadata", async (type) => {
    const { api, result } = await setup();
    const thread = result.current.thread;
    api.branches[0].name = `Updated after ${type}`;
    changesPages(api, page([change(type)]));
    await act(async () => { expect(await result.current.readChanges()).toBe(true); });
    expectReads(api, 1, 1, 0);
    expect(result.current.thread).not.toBe(thread);
    expect(result.current.thread?.branch.name).toBe(`Updated after ${type}`);
  });

  it.each(["runtime_profile", "runtime_profile_version"])("refreshes profiles for global %s metadata", async (type) => {
    const { api, client, result } = await setup();
    const before = result.current;
    await createProfile(client, `Updated after ${type}`);
    api.fetchMock.mockClear();
    changesPages(api, page([change(type, null)]));
    await act(async () => { expect(await result.current.readChanges()).toBe(true); });
    expectReads(api, 0, 0, 1);
    expect(result.current.page).toBe(before.page);
    expect(result.current.thread).toBe(before.thread);
    expect(result.current.profiles).not.toBe(before.profiles);
    expect(result.current.profiles[1].runtime_profile.name).toBe(`Updated after ${type}`);
  });

  it.each(["future_entity", "context_pack", "artifact", "item"])("conservatively refreshes frontend state for global %s metadata", async (type) => {
    const { api, result } = await setup();
    changesPages(api, page([change(type, null, 12, "delete")]));
    await act(async () => { expect(await result.current.readChanges()).toBe(true); });
    expectReads(api, 1, 1, 1);
  });

  it.each(["conv-1", "conv-2"])("refreshes profiles conservatively for unknown metadata scoped to %s", async (conversationId) => {
    const { api, result } = await setup();
    const before = result.current.thread;
    changesPages(api, page([change("future_entity", conversationId)]));
    await act(async () => { expect(await result.current.readChanges()).toBe(true); });
    expectReads(api, 1, conversationId === "conv-1" ? 1 : 0, 1);
    if (conversationId === "conv-2") expect(result.current.thread).toBe(before);
  });

  it("uses captured filters and branch for its authoritative reads", async () => {
    const { api, result } = await setup();
    await act(async () => { expect(await result.current.fork("alternate", null)).toBe(true); });
    await act(async () => { expect(await result.current.search("Alpha", true)).toBe(true); });
    const branchId = result.current.thread!.branch.id;
    api.fetchMock.mockClear();
    changesPages(api, page([change("branch")]));
    await act(async () => { expect(await result.current.readChanges()).toBe(true); });
    const path = api.fetchMock.mock.calls.find(([path]) => path.startsWith("/v1/conversations?"))![0];
    const params = new URL(path, "http://localhost").searchParams;
    expect(params.get("query")).toBe("Alpha");
    expect(params.get("archived")).toBe("true");
    expect(result.current.thread?.branch.id).toBe(branchId);
    expect(api.fetchMock.mock.calls.some(([path]) => path === `/v1/conversations/conv-1/branches/${branchId}/history`)).toBe(true);
  });

  it("does not acknowledge a failed drain and retries from the original cursor", async () => {
    const { api, result } = await setup();
    const before = result.current;
    const first = page([change("item")], 12, true);
    changesPages(api, first, json({ error: { code: "internal", message: "Drain failure" } }, 500));
    await act(async () => { expect(await result.current.readChanges()).toBe(false); });
    expectReads(api, 0, 0, 0);
    expect(result.current.page).toBe(before.page);
    expect(result.current.thread).toBe(before.thread);
    expect(result.current.profiles).toBe(before.profiles);
    expect(result.current.changes).toBe(before.changes);
    expect(result.current.cursor).toBe(11);
    expect(loadSession().cursor).toBe(11);
    expect(result.current.failure?.status).toBe(500);
    api.fetchMock.mockClear();
    changesPages(api, first, page([change("branch", "conv-1", 13)], 13));
    await act(async () => { expect(await result.current.readChanges()).toBe(true); });
    expect(cursors(api)).toEqual([11, 12]);
    expect(result.current.changes.map((entry) => entry.seq)).toEqual([12, 13]);
    expect(result.current.cursor).toBe(13);
  });

  it.each(["list", "thread", "profiles"])("keeps every canonical result staged when the %s refresh fails", async (read) => {
    const { api, client, result, queryClient } = await setup();
    const before = result.current;
    const cached = queryClient.getQueriesData({ queryKey: workspaceKeys.all });
    const cacheWrites: string[] = [];
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "success") cacheWrites.push(event.query.queryHash);
    });
    api.conversations[0].title = "External title";
    api.branches[0].name = "External branch";
    await createProfile(client, "External profile");
    api.fetchMock.mockClear();
    const matches = read === "list" ? (path: string) => path.startsWith("/v1/conversations?")
      : (path: string) => path === (read === "thread" ? "/v1/conversations/conv-1/branches/branch-1/history" : "/v1/runtime-profiles");
    api.failNext(matches);
    changesPages(api, page([change("future_entity", null)]));
    await act(async () => { expect(await result.current.readChanges()).toBe(false); });
    expectReads(api, 1, 1, 1);
    expect(result.current.page).toBe(before.page);
    expect(result.current.thread).toBe(before.thread);
    expect(result.current.profiles).toBe(before.profiles);
    expect(result.current.changes).toBe(before.changes);
    expect(result.current.cursor).toBe(11);
    expect(loadSession().cursor).toBe(11);
    expect(result.current.failure?.status).toBe(500);
    expect(cacheWrites).toEqual([]);
    for (const [key, value] of cached) expect(queryClient.getQueryData(key)).toBe(value);
    unsubscribe();
    api.fetchMock.mockClear();
    changesPages(api, page([change("future_entity", null)]));
    await act(async () => { expect(await result.current.readChanges()).toBe(true); });
    expect(cursors(api)).toEqual([11]);
    expect(result.current.page.conversations[0].title).toBe("External title");
    expect(result.current.thread?.branch.name).toBe("External branch");
    expect(result.current.profiles).toHaveLength(2);
    expect(result.current.cursor).toBe(12);
  });

  it.each([11, 19])("succeeds on an empty page with cursor %s without refreshing canonical state", async (nextCursor) => {
    const { api, result } = await setup();
    const before = result.current;
    changesPages(api, page([], nextCursor));
    await act(async () => { expect(await result.current.readChanges()).toBe(true); });
    expectReads(api, 0, 0, 0);
    expect(result.current.page).toBe(before.page);
    expect(result.current.thread).toBe(before.thread);
    expect(result.current.profiles).toBe(before.profiles);
    expect(result.current.cursor).toBe(nextCursor);
    expect(result.current.hasMoreChanges).toBe(false);
  });

  it("does not acknowledge a selected conversation delete when its authoritative thread is unavailable", async () => {
    const { api, result } = await setup();
    const before = result.current;
    api.conversations.splice(0, 1);
    changesPages(api, page([change("conversation", "conv-1", 12, "delete")]));
    await act(async () => { expect(await result.current.readChanges()).toBe(false); });
    expect(result.current.failure?.status).toBe(404);
    expect(result.current.page).toBe(before.page);
    expect(result.current.thread).toBe(before.thread);
    expect(result.current.profiles).toBe(before.profiles);
    expect(result.current.changes).toBe(before.changes);
    expect(result.current.cursor).toBe(11);
  });

  it("resets a previously displayed has-more diagnostic together with the cursor and changes", () => {
    const { result } = renderHook(() => useDiagnostics(23));
    act(() => {
      result.current.setChanges([change("item")]);
      result.current.setHasMoreChanges(true);
    });
    expect(result.current.hasMoreChanges).toBe(true);
    act(() => result.current.reset());
    expect(result.current.cursor).toBe(0);
    expect(result.current.changes).toEqual([]);
    expect(result.current.hasMoreChanges).toBe(false);
  });

  it("leaves the cursor unacknowledged while authoritative reads are pending and rejects competing actions", async () => {
    const { api, result } = await setup();
    const before = result.current;
    changesPages(api, page([change("item")]));
    const pending = api.deferNext("GET", "/v1/conversations/conv-1");
    let sync!: Promise<boolean>;
    await act(async () => { sync = result.current.readChanges(); await pending.requested; });
    expect(result.current.busy).toBe(true);
    expect(result.current.cursor).toBe(11);
    expect(result.current.page).toBe(before.page);
    expect(result.current.thread).toBe(before.thread);
    expect(result.current.changes).toBe(before.changes);
    await act(async () => {
      expect(await result.current.search("blocked")).toBe(false);
      expect(await result.current.sendMessage("blocked")).toBe(false);
      expect(await result.current.addProfile("blocked", "manual")).toBe(false);
      expect(await result.current.readChanges()).toBe(false);
      result.current.newChat();
      result.current.disconnect();
    });
    expect(cursors(api)).toEqual([11]);
    expect(result.current.connected).toBe(true);
    expect(result.current.thread).toBe(before.thread);
    await act(async () => { pending.release(); expect(await sync).toBe(true); });
    expect(result.current.cursor).toBe(12);
    act(() => result.current.disconnect());
    expect(result.current.cursor).toBe(0);
    expect(result.current.changes).toEqual([]);
    expect(result.current.hasMoreChanges).toBe(false);
  });

  it("keeps the captured thread refreshed while a newer route intent is pending", async () => {
    let request = "alpha-entry";
    const navigate = vi.fn();
    const navigation: WorkspaceNavigation = {
      id: "conv-1", branch: "branch-1", invalid: false, locationRequest: "alpha-entry",
      request: () => request, navigate, selectConversation: async () => true,
    };
    const { api, result, rerender } = await setup(navigation);
    navigate.mockClear();
    api.branches[0].name = "Fresh captured thread";
    changesPages(api, page([change("branch")]));
    const pending = api.deferNext("GET", "/v1/conversations/conv-1");
    let sync!: Promise<boolean>;
    await act(async () => { sync = result.current.readChanges(); await pending.requested; });
    request = "beta-entry";
    await act(async () => { pending.release(); expect(await sync).toBe(true); });
    expect(result.current.thread).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    // Reveal the captured selection without starting another read: its staged
    // authoritative refresh must not have been discarded when the route moved.
    act(() => { request = "alpha-entry"; rerender(); });
    expect(result.current.thread?.branch.name).toBe("Fresh captured thread");
    expect(result.current.cursor).toBe(12);
  });
});
