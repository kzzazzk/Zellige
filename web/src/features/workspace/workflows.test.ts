import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { apiFixture } from "../../test/apiFixture";
import { loadSession } from "../../storage/session";
import { useWorkspace } from "../useWorkspace";

async function setup() {
  const api = apiFixture();
  const hook = renderHook(useWorkspace);
  await act(async () => { expect(await hook.result.current.connect(" secret ")).toBe(true); });
  return { api, ...hook };
}

const response = (data: unknown) => new Response(JSON.stringify(data), {
  status: 200, headers: { "Content-Type": "application/json" },
});

describe("workspace workflows", () => {
  it("commits search filters only after a successful read and de-duplicates pagination against the captured page", async () => {
    const { api, result } = await setup();
    await act(async () => { await result.current.sendMessage("one"); });
    const conversation = result.current.thread!.conversation;
    api.failNext((path) => path.startsWith("/v1/conversations?"));
    await act(async () => { expect(await result.current.search("failed", true)).toBe(false); });
    expect(result.current.query).toBe("");
    expect(result.current.archived).toBe(false);
    api.fetchMock.mockResolvedValueOnce(response({ conversations: [conversation], has_more: true }));
    await act(async () => { expect(await result.current.search("one")).toBe(true); });
    const second = { ...conversation, id: "second" };
    api.fetchMock.mockResolvedValueOnce(response({ conversations: [conversation, second], has_more: false }));
    await act(async () => { expect(await result.current.loadMore()).toBe(true); });
    expect(result.current.page.conversations.map((entry) => entry.id)).toEqual([conversation.id, "second"]);
    const url = new URL(api.fetchMock.mock.calls.at(-1)![0], "http://localhost");
    expect(url.searchParams.get("offset")).toBe("1");
    expect(url.searchParams.get("query")).toBe("one");
  });

  it("does not retry metadata conflicts and preserves the existing recovery-read error behavior", async () => {
    const { api, result } = await setup();
    await act(async () => { await result.current.sendMessage("one"); });
    const original = result.current.thread!.conversation;
    api.conversations[0].updated_at += 1;
    api.failNext((path) => path.startsWith("/v1/conversations?"));
    await act(async () => {
      expect(await result.current.changeConversation(original, { title: "rename" })).toBe(false);
    });
    expect(result.current.failure?.status).toBe(500);
    const writes = api.fetchMock.mock.calls.filter(([, options]) => options?.method === "PATCH");
    expect(writes).toHaveLength(1);
    expect(JSON.parse(String(writes[0][1]!.body)).expected_updated_at).toBe(original.updated_at);
    expect(result.current.thread!.conversation.title).toBe(original.title);
  });

  it("queues on the selected branch/version, scopes the notice, and preserves diagnostic reset inconsistencies", async () => {
    const { api, result } = await setup();
    await act(async () => { await result.current.sendMessage("one"); });
    await act(async () => { await result.current.fork("alternate", null); });
    await act(async () => { await result.current.addProfile("profile", "manual"); });
    const target = result.current.thread!;
    const profileId = result.current.profileId;
    await act(async () => { expect(await result.current.queueRun()).toBe(true); });
    const request = api.fetchMock.mock.calls.find(([, options]) => options?.method === "POST" && String(options.body).includes("profile_version_id"))!;
    expect(JSON.parse(String(request[1]!.body))).toMatchObject({ branch_id: target.branch.id, runtime_profile_version_id: profileId });
    expect(result.current.thread!.runs).toHaveLength(1);
    expect(result.current.thread!.items).toEqual(target.items);
    expect(result.current.queuedNotice).toBe(true);
    act(() => result.current.newChat());
    expect(result.current.queuedNotice).toBe(false);
    api.fetchMock.mockResolvedValueOnce(response({ changes: [], next_cursor: 19, has_more: true }));
    await act(async () => { expect(await result.current.readChanges()).toBe(true); });
    expect(loadSession().cursor).toBe(19);
    await act(async () => { await result.current.search("", true); });
    act(() => result.current.disconnect());
    expect(result.current.cursor).toBe(0);
    expect(result.current.changes).toEqual([]);
    expect(result.current.hasMoreChanges).toBe(true);
    expect(result.current.archived).toBe(true);
  });
});
