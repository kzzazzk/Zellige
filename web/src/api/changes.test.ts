import { describe, expect, it, vi } from "vitest";
import { classifyChanges, drainChanges } from "./changes";
import { createClient } from "./client";
import { ApiError, type Change, type Changes } from "./types";

function change(overrides: Partial<Change> = {}): Change {
  return {
    seq: 1,
    conversation_id: "selected",
    entity_type: "item",
    entity_id: "item-1",
    operation: "upsert",
    data: {},
    changed_at: 1,
    ...overrides,
  };
}

function mockPages(...pages: Changes[]) {
  const fetchMock = vi.fn();
  for (const page of pages) {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(page), { status: 200 }));
  }
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, client: createClient(() => "secret") };
}

describe("drainChanges", () => {
  it("accumulates pages using each next cursor until the first has_more=false", async () => {
    const first = change({ seq: 8 });
    const second = change({ seq: 12 });
    const third = change({ seq: 13 });
    const { client, fetchMock } = mockPages(
      { changes: [first], next_cursor: 8, has_more: true },
      { changes: [second], next_cursor: 12, has_more: true },
      { changes: [third], next_cursor: 13, has_more: false },
    );

    expect(await drainChanges(client, 4)).toEqual({
      status: 200,
      data: { changes: [first, second, third], next_cursor: 13, has_more: false },
    });
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/v1/changes?cursor=4&limit=100",
      "/v1/changes?cursor=8&limit=100",
      "/v1/changes?cursor=12&limit=100",
    ]);
    expect((fetchMock.mock.calls[0][1].headers as Headers).get("Authorization")).toBe("Bearer secret");
  });

  it.each([
    { next_cursor: 4, has_more: true },
    { next_cursor: 3, has_more: true },
    { next_cursor: 3, has_more: false },
  ])("rejects a non-advancing or regressing cursor: %j", async (pagination) => {
    const { client, fetchMock } = mockPages({ changes: [], ...pagination });
    await expect(drainChanges(client, 4)).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([null, "5"])("rejects an invalid wire cursor without requesting another page: %j", async (next_cursor) => {
    const { client, fetchMock } = mockPages();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      changes: [], next_cursor, has_more: true,
    }), { status: 200 }));
    await expect(drainChanges(client, 4)).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([4, 7])("accepts an empty drained page with cursor %s", async (next_cursor) => {
    const { client, fetchMock } = mockPages({ changes: [], next_cursor, has_more: false });
    expect(await drainChanges(client, 4)).toEqual({
      status: 200,
      data: { changes: [], next_cursor, has_more: false },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("propagates a later page failure and retries from the original cursor", async () => {
    const first = { changes: [change({ seq: 8 })], next_cursor: 8, has_more: true };
    const last = { changes: [], next_cursor: 8, has_more: false };
    const { client, fetchMock } = mockPages(first);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "failed", message: "failed page" } }), { status: 500 }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(first), { status: 200 }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(last), { status: 200 }));

    await expect(drainChanges(client, 4)).rejects.toMatchObject({ status: 500, code: "failed" });
    expect((await drainChanges(client, 4)).data.changes).toEqual(first.changes);
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/v1/changes?cursor=4&limit=100",
      "/v1/changes?cursor=8&limit=100",
      "/v1/changes?cursor=4&limit=100",
      "/v1/changes?cursor=8&limit=100",
    ]);
  });
});

describe("classifyChanges", () => {
  it("does not invalidate anything for no changes", () => {
    expect(classifyChanges([], "selected")).toEqual({ conversations: false, thread: false, profiles: false });
  });

  it("invalidates the list for another conversation without refreshing the selected thread", () => {
    expect(classifyChanges([change({ conversation_id: "other" })], "selected")).toEqual({
      conversations: true, thread: false, profiles: false,
    });
  });

  it.each(["item", "branch", "run"])("invalidates the selected thread for scoped %s metadata", (entity_type) => {
    expect(classifyChanges([change({ entity_type, data: { irrelevant: "not a DTO" } })], "selected")).toEqual({
      conversations: true, thread: true, profiles: false,
    });
  });

  it("conservatively refreshes global profiles for unknown scoped types while respecting thread scope", () => {
    expect(classifyChanges([change({ entity_type: "future_scoped_entity" })], "selected")).toEqual({
      conversations: true, thread: true, profiles: true,
    });
    expect(classifyChanges([change({ entity_type: "future_scoped_entity", conversation_id: "other" })], "selected")).toEqual({
      conversations: true, thread: false, profiles: true,
    });
  });

  it.each(["runtime_profile", "runtime_profile_version"])("invalidates profiles for %s", (entity_type) => {
    expect(classifyChanges([change({ entity_type, conversation_id: null })], "selected")).toEqual({
      conversations: false, thread: false, profiles: true,
    });
  });

  it.each(["context_pack", "artifact", "future_global_entity", "item"])("conservatively invalidates frontend state for global %s", (entity_type) => {
    expect(classifyChanges([change({ entity_type, conversation_id: null })], "selected")).toEqual({
      conversations: true, thread: true, profiles: true,
    });
    expect(classifyChanges([change({ entity_type, conversation_id: null })], null)).toEqual({
      conversations: true, thread: false, profiles: true,
    });
  });

  it("uses conversation entity_id metadata safely for a delete with no payload", () => {
    expect(classifyChanges([change({ entity_type: "conversation", entity_id: "selected", conversation_id: null, operation: "delete" })], "selected")).toEqual({
      conversations: true, thread: true, profiles: false,
    });
    expect(classifyChanges([change({ conversation_id: "other", operation: "delete" })], "selected")).toEqual({
      conversations: true, thread: false, profiles: false,
    });
  });

  it("coalesces duplicate scoped and profile changes into one intent per resource", () => {
    expect(classifyChanges([
      change(), change({ entity_type: "branch" }), change({ entity_type: "run" }),
      change({ entity_type: "runtime_profile", conversation_id: null }),
      change({ entity_type: "runtime_profile_version", conversation_id: null }),
    ], "selected")).toEqual({ conversations: true, thread: true, profiles: true });
  });
});
