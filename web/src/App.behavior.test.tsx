import { createQueryWrapper } from "./test/queryWrapper";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useWorkspace } from "./features/useWorkspace";
import { apiFixture } from "./test/apiFixture";
import { saveSession, loadSession } from "./storage/session";
import { workspaceKeys } from "./features/workspace/queryKeys";

async function setup() {
  const api = apiFixture();
  const provider = createQueryWrapper();
  const hook = renderHook(useWorkspace, provider);
  await act(async () => { expect(await hook.result.current.connect(" secret ")).toBe(true); });
  return { api, queryClient: provider.queryClient, ...hook };
}
const itemsRequest = (path: string) => path.endsWith("/items");
const listRequest = (path: string) => path.startsWith("/v1/conversations?");

describe("Workspace safety characterization", () => {
  it("rejects a second invocation synchronously while first creation is deferred", async () => {
    const { api, result } = await setup();
    const release = api.deferNext((path, method) => path === "/v1/conversations" && method === "POST");
    await act(async () => {
      const first = result.current.sendMessage("one");
      expect(await result.current.sendMessage("two")).toBe(false);
      release();
      expect(await first).toBe(true);
    });
    expect(api.conversations).toHaveLength(1);
    expect(api.items).toHaveLength(1);
    const body = JSON.parse(String(api.fetchMock.mock.calls.find(([path]) => itemsRequest(path))![1]!.body));
    expect(body.expected_head_item_id).toBeNull();
  });

  it("transfers a failed first append draft to the created thread; manual retry creates no second conversation", async () => {
    const { api, result, queryClient } = await setup();
    act(() => result.current.setDraft("retained"));
    api.failNext(itemsRequest);
    await act(async () => { expect(await result.current.sendMessage("retained")).toBe(false); });
    expect(result.current.draft).toBe("retained");
    expect(result.current.thread?.items).toHaveLength(0);
    expect(queryClient.getQueryData(workspaceKeys.thread("conv-1", "branch-1"))).toBe(result.current.thread);
    await act(async () => { expect(await result.current.sendMessage(result.current.draft)).toBe(true); });
    expect(api.conversations).toHaveLength(1);
    expect(api.items).toHaveLength(1);
    expect(result.current.draft).toBe("");
  });

  it("retains successful local append and clears its draft when follow-up reads fail", async () => {
    const { api, result, queryClient } = await setup();
    act(() => result.current.setDraft("saved"));
    api.failNext(listRequest);
    await act(async () => { expect(await result.current.sendMessage("saved")).toBe(true); });
    expect(result.current.thread?.items).toHaveLength(1);
    expect(queryClient.getQueryData(workspaceKeys.thread("conv-1", "branch-1"))).toBe(result.current.thread);
    expect(result.current.draft).toBe("");
    expect(result.current.failure?.message).toContain("Mensaje guardado");
    expect(api.items).toHaveLength(1);
  });

  it("keeps the original conflict when recovery fails, and never retries the write", async () => {
    const { api, result } = await setup();
    await act(async () => { await result.current.sendMessage("first"); });
    act(() => result.current.setDraft("conflicting"));
    api.conflictNext();
    api.failNext((path) => path.endsWith("/history"));
    await act(async () => { expect(await result.current.sendMessage("conflicting")).toBe(false); });
    expect(result.current.failure?.code).toBe("head_conflict");
    expect(result.current.draft).toBe("conflicting");
    expect(api.fetchMock.mock.calls.filter(([path]) => itemsRequest(path))).toHaveLength(2);
  });

  it("forks an edit from the non-root parent and retains the new branch after replacement failure", async () => {
    const { api, result, queryClient } = await setup();
    await act(async () => { await result.current.sendMessage("root"); });
    await act(async () => { await result.current.sendMessage("child"); });
    await act(async () => { await result.current.sendMessage("descendant"); });
    api.failNext(itemsRequest);
    await act(async () => { expect(await result.current.fork("edit", api.items[1].parent_item_id, "replacement")).toBe(false); });
    expect(api.branches[1].head_item_id).toBe(api.items[0].id);
    expect(result.current.thread?.branch.id).toBe(api.branches[1].id);
    expect(queryClient.getQueryData(workspaceKeys.thread("conv-1", api.branches[1].id))).toBe(result.current.thread);
    expect(queryClient.getQueryData(workspaceKeys.thread("conv-1", "branch-1"))).toBeDefined();
    expect(api.items).toHaveLength(3);
  });

  it("preserves independent drafts in two conversations and does not persist them on reload", async () => {
    const { result, unmount } = await setup();
    await act(async () => { await result.current.sendMessage("A"); });
    const first = result.current.thread!.conversation.id;
    act(() => { result.current.setDraft("draft A"); result.current.newChat(); });
    await act(async () => { await result.current.sendMessage("B"); });
    act(() => result.current.setDraft("draft B"));
    await act(async () => { await result.current.selectConversation(first); });
    expect(result.current.draft).toBe("draft A");
    unmount();
    const restored = renderHook(useWorkspace, createQueryWrapper());
    await waitFor(() => expect(restored.result.current.connected).toBe(true));
    expect(restored.result.current.thread?.conversation.id).toBe(first);
    expect(restored.result.current.draft).toBe("");
  });

  it("invalid reconnect preserves the active token, selection and drafts", async () => {
    const { result } = await setup();
    await act(async () => { await result.current.sendMessage("original"); });
    act(() => result.current.setDraft("draft"));
    const thread = result.current.thread;
    await act(async () => { expect(await result.current.connect("wrong")).toBe(false); });
    expect(result.current.token).toBe("secret");
    expect(result.current.thread).toBe(thread);
    expect(result.current.draft).toBe("draft");
  });

  it("restores the exact branch and cursor without prematurely overwriting saved selection", async () => {
    const { result, api, unmount } = await setup();
    await act(async () => { await result.current.sendMessage("root"); });
    await act(async () => { await result.current.fork("other", null); });
    unmount();
    saveSession({ token: "secret", conversationId: "conv-1", branchId: api.branches[1].id, cursor: 7 });
    const release = api.deferNext(listRequest);
    const restored = renderHook(useWorkspace, createQueryWrapper());
    expect(loadSession().branchId).toBe(api.branches[1].id);
    expect(restored.result.current.busy).toBe(true);
    act(release);
    await waitFor(() => expect(restored.result.current.connected).toBe(true));
    expect(restored.result.current.thread?.branch.id).toBe(api.branches[1].id);
    expect(restored.result.current.cursor).toBe(7);
  });
});
