import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ConversationPage } from "../../api/types";
import { apiFixture } from "../../test/apiFixture";
import { createQueryWrapper } from "../../test/queryWrapper";
import { useWorkspace } from "../useWorkspace";
import { workspaceKeys } from "./queryKeys";
import { useWorkspaceServerState } from "./useWorkspaceServerState";

async function connectedWorkspace() {
  const api = apiFixture();
  const provider = createQueryWrapper();
  const hook = renderHook(useWorkspace, provider);
  await act(async () => { expect(await hook.result.current.connect("secret")).toBe(true); });
  await act(async () => { expect(await hook.result.current.sendMessage("Original")).toBe(true); });
  await act(async () => { expect(await hook.result.current.addProfile("Primary", "manual")).toBe(true); });
  return { api, ...provider, ...hook };
}

describe("workspace Query setter and staging behavior", () => {
  it("caches authoritative thread identities, clears only selection on null, and writes filtered pages", async () => {
    const { queryClient, wrapper, result } = await connectedWorkspace();
    const thread = result.current.thread!;
    const state = renderHook(useWorkspaceServerState, { wrapper });
    const authoritative = { ...thread, branch: { ...thread.branch, id: "resolved-branch" } };
    const key = workspaceKeys.thread(thread.conversation.id, "resolved-branch");
    act(() => state.result.current.setThread(authoritative));
    expect(state.result.current.thread).toBe(queryClient.getQueryData(key));
    expect(queryClient.getQueryData(key)).toBe(authoritative);
    expect(queryClient.getQueryData(workspaceKeys.thread(thread.conversation.id, ""))).toBeUndefined();
    act(() => state.result.current.setThread(null));
    expect(state.result.current.thread).toBeNull();
    expect(queryClient.getQueryData(key)).toBe(authoritative);
    const filteredPage: ConversationPage = { conversations: [], has_more: true };
    const priorPage = queryClient.getQueryData(workspaceKeys.conversations(false, ""));
    act(() => {
      state.result.current.setPage(filteredPage, { archived: true, query: "needle" });
      state.result.current.setArchived(true);
      state.result.current.setQuery("needle");
      state.result.current.setProfiles((current) => [...current, current[0]]);
    });
    expect(state.result.current.page).toBe(filteredPage);
    expect(queryClient.getQueryData(workspaceKeys.conversations(true, "needle"))).toBe(filteredPage);
    expect(queryClient.getQueryData(workspaceKeys.conversations(false, ""))).toBe(priorPage);
    expect(state.result.current.profiles).toBe(queryClient.getQueryData(workspaceKeys.profiles));
    expect(state.result.current.profiles).toHaveLength(2);
  });

  it("preserves the complete cache, token, selection and drafts when reconnect staging fails", async () => {
    const { api, queryClient, result } = await connectedWorkspace();
    act(() => result.current.setDraft("Retained draft"));
    await act(async () => { expect(await result.current.search("Original", true)).toBe(true); });
    const before = queryClient.getQueriesData({ queryKey: workspaceKeys.all });
    const thread = result.current.thread;
    // The list succeeds with different data before the profiles read fails.
    api.conversations[0].title = "New server title";
    api.failNext("GET", "/v1/runtime-profiles");
    await act(async () => { expect(await result.current.connect("secret")).toBe(false); });
    expect(queryClient.getQueriesData({ queryKey: workspaceKeys.all })).toEqual(before);
    for (const [key, value] of before) expect(queryClient.getQueryData(key)).toBe(value);
    expect(result.current.token).toBe("secret");
    expect(result.current.thread).toBe(thread);
    expect(result.current.draft).toBe("Retained draft");
    expect(result.current.archived).toBe(true);
    expect(result.current.query).toBe("Original");
  });
});
