import { describe, expect, it } from "vitest";
import { createClient } from "../api/client";
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
import { createRun, listRuns } from "../api/runs";
import { apiFixture } from "./apiFixture";

const client = () => createClient(() => "secret");

describe("apiFixture", () => {
  it("isolates conversations, branches, histories and requested run heads", async () => {
    apiFixture();
    const api = client();
    const a = (await createConversation(api, "A")).data;
    const b = (await createConversation(api, "B")).data;
    const first = (await appendMessage(api, a.conversation.id, a.branch.id, null, "A1")).data;
    const fork = (await createBranch(api, a.conversation.id, "fork", first.id)).data;
    const edited = (await appendMessage(api, a.conversation.id, fork.id, first.id, "A2")).data;
    const other = (await appendMessage(api, b.conversation.id, b.branch.id, null, "B1")).data;
    expect((await listBranches(api, b.conversation.id)).data.branches).toEqual([expect.objectContaining({ id: b.branch.id })]);
    expect((await getHistory(api, a.conversation.id, a.branch.id)).data.items).toEqual([first]);
    expect((await getHistory(api, a.conversation.id, fork.id)).data.items).toEqual([first, edited]);
    expect((await getHistory(api, b.conversation.id, b.branch.id)).data.items).toEqual([other]);
    const runA = (await createRun(api, a.conversation.id, fork.id, "profilev-1")).data;
    const runB = (await createRun(api, b.conversation.id, b.branch.id, "profilev-1")).data;
    expect(runA.input_head_item_id).toBe(edited.id);
    expect(runB.input_head_item_id).toBe(other.id);
    expect(runA.id).not.toBe(runB.id);
    expect((await listRuns(api, a.conversation.id)).data.runs).toEqual([runA]);
    await expect(getHistory(api, a.conversation.id, b.branch.id)).rejects.toMatchObject({ status: 404 });
    await expect(createBranch(api, a.conversation.id, "bad", other.id)).rejects.toMatchObject({ code: "invalid_branch" });
    await expect(createRun(api, a.conversation.id, b.branch.id, "profilev-1")).rejects.toMatchObject({ status: 404 });
    expect((await listConversations(api, false, "B")).data.conversations).toHaveLength(1);
    expect((await listConversations(api, false, "", 1)).data.conversations[0].id).toBe(b.conversation.id);
  });

  it("rejects stale heads and updated_at without mutating state", async () => {
    const fixture = apiFixture();
    const api = client();
    const { conversation, branch } = (await createConversation(api, "A")).data;
    const first = (await appendMessage(api, conversation.id, branch.id, null, "first")).data;
    await expect(appendMessage(api, conversation.id, branch.id, null, "stale")).rejects.toMatchObject({ code: "head_conflict", status: 409 });
    await expect(updateConversation(api, conversation, { title: "stale" })).rejects.toMatchObject({ code: "conversation_conflict", status: 409 });
    expect(fixture.items).toEqual([first]);
    expect(fixture.conversations[0]).toMatchObject({ title: "A", updated_at: 2 });
    const current = (await getConversation(api, conversation.id)).data;
    const updated = (await updateConversation(api, current, { title: "renamed", archived: true })).data;
    expect(updated).toMatchObject({ title: "renamed", updated_at: 3 });
    await expect(updateConversation(api, current, { archived: false })).rejects.toMatchObject({ code: "conversation_conflict" });
    expect((await listConversations(api, true)).data.conversations).toEqual([updated]);
  });

  it("fails or defers only the next matching request", async () => {
    const fixture = apiFixture();
    const api = client();
    const { conversation, branch } = (await createConversation(api, "A")).data;
    const path = `/v1/conversations/${conversation.id}/branches/${branch.id}/items`;
    fixture.failNext("POST", path);
    await getConversation(api, conversation.id);
    await expect(appendMessage(api, conversation.id, branch.id, null, "failed")).rejects.toMatchObject({ status: 500 });
    expect(fixture.items).toHaveLength(0);
    const deferred = fixture.deferNext("POST", path);
    const append = appendMessage(api, conversation.id, branch.id, null, "saved");
    await deferred.requested;
    expect(fixture.items).toHaveLength(0);
    deferred.release();
    await append;
    expect(fixture.items).toHaveLength(1);
  });
});
