import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryHistory } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { App } from "../../App";
import { createClient } from "../../api/client";
import { appendMessage, createBranch, createConversation } from "../../api/conversations";
import { loadSession, saveSession } from "../../storage/session";
import { apiFixture } from "../../test/apiFixture";

const ready = () => waitFor(() => expect(screen.queryByRole("status", { name: "Sincronizando" })).not.toBeInTheDocument());
async function setup() {
  const api = apiFixture();
  const client = createClient(() => "secret");
  await createConversation(client, "Alpha");
  await createConversation(client, "Beta");
  const alternate = (await createBranch(client, "conv-1", "alternate", null)).data;
  saveSession({ token: "secret", conversationId: "conv-1", branchId: "branch-1", cursor: 11 });
  const history = createMemoryHistory({ initialEntries: ["/chat/conv-1"] });
  render(<App history={history} />);
  await waitFor(() => expect(screen.getByLabelText("Rama")).toHaveValue("branch-1"));
  await ready();
  const original = api.fetchMock.getMockImplementation()!;
  api.fetchMock.mockImplementation(async (path, options) => path.startsWith("/v1/changes?")
    ? new Response(JSON.stringify({
      changes: [{ seq: 12, conversation_id: "conv-1", entity_type: "item", entity_id: "external",
        operation: "upsert", data: {}, changed_at: 1 }],
      next_cursor: 12, has_more: false,
    }), { status: 200, headers: { "Content-Type": "application/json" } })
    : original(path, options));
  return { api, client, alternate, history };
}

describe("manual sync with browser navigation", () => {
  it.each(["different conversation", "different branch"])(
    "resolves the latest intent after navigation to a %s", async (destination) => {
      const { api, client, alternate, history } = await setup();
      const pending = api.deferNext("GET", "/v1/conversations/conv-1");
      fireEvent.click(screen.getByRole("button", { name: "Detalles de la conversación" }));
      fireEvent.click(screen.getByRole("button", { name: "Sincronizar cambios" }));
      await act(async () => { await pending.requested; });
      await appendMessage(client, "conv-1", "branch-1", null, "External synchronized message");
      act(() => {
        history.push("/chat/conv-2");
        if (destination === "different branch")
          history.push("/chat/conv-1", { workspaceBranch: alternate.id });
      });
      await act(async () => { pending.release(); });
      const branch = destination === "different conversation" ? "branch-2"
        : destination === "different branch" ? alternate.id : "branch-1";
      await waitFor(() => expect(screen.getByLabelText("Rama")).toHaveValue(branch));
      await ready();
      expect(loadSession().branchId).toBe(branch);
      expect(loadSession().cursor).toBe(12);
      expect(history.location.pathname).toBe(destination === "different conversation" ? "/chat/conv-2" : "/chat/conv-1");
      expect(screen.queryByText("External synchronized message")).not.toBeInTheDocument();
    },
  );
  it("preserves synchronization when history returns to the same conversation and branch", async () => {
    const { api, client, history } = await setup();
    await appendMessage(client, "conv-1", "branch-1", null, "External synchronized message");
    const pending = api.deferNext("GET", "/v1/conversations/conv-1");
    fireEvent.click(screen.getByRole("button", { name: "Detalles de la conversación" }));
    fireEvent.click(screen.getByRole("button", { name: "Sincronizar cambios" }));
    await act(async () => { await pending.requested; });
    act(() => {
      history.push("/chat/conv-2");
      history.push("/chat/conv-1", { workspaceBranch: "branch-1" });
    });
    await act(async () => { pending.release(); });
    await waitFor(() => expect(screen.getByLabelText("Rama")).toHaveValue("branch-1"));
    await ready();
    expect(loadSession().cursor).toBe(12);
    expect(screen.getByText("External synchronized message")).toBeInTheDocument();
  });

});
