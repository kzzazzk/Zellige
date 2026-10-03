import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryHistory } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { App } from "../../App";
import { apiFixture } from "../../test/apiFixture";
import { createClient } from "../../api/client";
import { createBranch, createConversation } from "../../api/conversations";
import { loadSession, saveSession } from "../../storage/session";

const ready = () => waitFor(() => expect(screen.queryByRole("status", { name: "Sincronizando" })).not.toBeInTheDocument());
async function setup(path = "/chat/conv-1") {
  const api = apiFixture();
  const client = createClient(() => "secret");
  await createConversation(client, "Alpha");
  await createConversation(client, "Beta");
  saveSession({ token: "secret", conversationId: "conv-1", branchId: "branch-1", cursor: 9 });
  const history = createMemoryHistory({ initialEntries: [path] });
  const view = render(<App history={history} />);
  await ready();
  return { api, history, view };
}
function send(text: string) {
  fireEvent.change(screen.getByLabelText("Mensaje"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar mensaje" }));
}

describe("navigation under the workspace gate", () => {
  it("failed navigation retains thread, branch, draft and token without losing its notice", async () => {
    const { api, history } = await setup();
    fireEvent.change(screen.getByLabelText("Mensaje"), { target: { value: "Alpha draft" } });
    api.failNext("GET", "/v1/conversations/conv-2", "different_production_code", 404);
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    await screen.findByRole("alert");
    await waitFor(() => expect(history.location.pathname).toBe("/chat/conv-1"));
    await ready();
    expect(screen.getByLabelText("Rama")).toHaveValue("branch-1");
    expect(screen.getByLabelText("Mensaje")).toHaveValue("Alpha draft");
    expect(screen.getByRole("alert")).toHaveTextContent("No se encontró");
    expect(loadSession()).toEqual({ token: "secret", conversationId: "conv-1", branchId: "branch-1", cursor: 9 });
  });

  it("captured append completes once before latest POP is reconciled", async () => {
    const { api, history } = await setup();
    const deferred = api.deferNext("POST", "/v1/conversations/conv-1/branches/branch-1/items");
    send("Captured Alpha");
    await act(async () => { await deferred.requested; });
    act(() => history.push("/chat/conv-2"));
    expect(api.items).toHaveLength(0);
    await act(async () => { deferred.release(); });
    await ready();
    await waitFor(() => expect(loadSession().conversationId).toBe("conv-2"));
    expect(api.items).toHaveLength(1);
    expect(screen.getByLabelText("Rama")).toHaveValue("branch-2");
    expect(screen.queryByText("Captured Alpha")).not.toBeInTheDocument();
  });

  it("coalesces navigation during an append to a same-conversation entry with a different branch", async () => {
    const { api, history } = await setup();
    const branch = (await createBranch(createClient(() => "secret"), "conv-1", "alternate", null)).data;
    fireEvent.change(screen.getByLabelText("Mensaje"), { target: { value: "Main draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    await waitFor(() => expect(screen.getByLabelText("Rama")).toHaveValue("branch-2"));
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    await waitFor(() => expect(screen.getByLabelText("Rama")).toHaveValue("branch-1"));
    fireEvent.change(screen.getByLabelText("Rama"), { target: { value: branch.id } });
    await waitFor(() => expect(history.location.state.workspaceBranch).toBe(branch.id));
    await ready();
    const deferred = api.deferNext("POST", `/v1/conversations/conv-1/branches/${branch.id}/items`);
    send("Captured alternate");
    await act(async () => { await deferred.requested; });
    act(() => { history.back(); history.back(); });
    // The old branch must not be persisted under the destination entry.
    expect(loadSession().branchId).toBe(branch.id);
    await act(async () => { deferred.release(); });
    await waitFor(() => expect(screen.getByLabelText("Rama")).toHaveValue("branch-1"));
    await ready();
    expect(loadSession().branchId).toBe("branch-1");
    expect(screen.getByLabelText("Mensaje")).toHaveValue("Main draft");
    expect(api.items).toHaveLength(1);
    expect(api.branches.find((entry) => entry.id === branch.id)?.head_item_id).toBe(api.items[0].id);
    expect(api.fetchMock.mock.calls.filter(([path]) => path === `/v1/conversations/conv-1/branches/${branch.id}/items`)).toHaveLength(1);
    expect(screen.queryByText("Captured alternate")).not.toBeInTheDocument();
  });

  it("adopts first creation even when append fails", async () => {
    const { api, history } = await setup("/");
    api.failNext("POST", "/v1/conversations/conv-3/branches/branch-3/items");
    send("Created draft");
    await screen.findByRole("alert");
    await ready();
    expect(history.location.pathname).toBe("/chat/conv-3");
    expect(screen.getByLabelText("Mensaje")).toHaveValue("Created draft");
    expect(loadSession().conversationId).toBe("conv-3");
    expect(api.items).toHaveLength(0);
  });

  it("creation cannot overwrite a newer navigation", async () => {
    const { api, history } = await setup("/");
    const deferred = api.deferNext("POST", "/v1/conversations");
    send("Created elsewhere");
    await act(async () => { await deferred.requested; });
    act(() => history.push("/chat/conv-2"));
    await act(async () => { deferred.release(); });
    await waitFor(() => expect(screen.getByLabelText("Rama")).toHaveValue("branch-2"));
    expect(history.location.pathname).toBe("/chat/conv-2");
    expect(api.items).toHaveLength(1);
    expect(loadSession().conversationId).toBe("conv-2");
  });

  it("superseded route failures do not replace a newer root or show obsolete errors", async () => {
    const { api, history } = await setup();
    const deferred = api.deferNext("GET", "/v1/conversations/conv-2");
    act(() => history.push("/chat/conv-2"));
    await act(async () => { await deferred.requested; });
    act(() => history.push("/"));
    api.conversations.splice(1, 1);
    await act(async () => { deferred.release(); });
    await ready();
    expect(history.location.pathname).toBe("/");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(loadSession().conversationId).toBe("");
  });

  it("unmount ignores pending completion and does not persist the obsolete selection", async () => {
    const { api, history, view } = await setup();
    const deferred = api.deferNext("GET", "/v1/conversations/conv-2");
    act(() => history.push("/chat/conv-2"));
    await act(async () => { await deferred.requested; });
    const before = loadSession();
    view.unmount();
    await act(async () => { deferred.release(); });
    expect(loadSession()).toEqual(before);
  });

  it("unknown shapes recover accessibly even without credentials", async () => {
    apiFixture();
    const history = createMemoryHistory({ initialEntries: ["/unknown/path"] });
    render(<App history={history} />);
    await screen.findByRole("alert");
    await waitFor(() => expect(history.location.pathname).toBe("/"));
    expect(screen.getByRole("button", { name: "Conectar servidor" })).toBeEnabled();
  });
  it("navigation during credential bootstrap resolves only the latest conversation", async () => {
    const api = apiFixture();
    const client = createClient(() => "secret");
    await createConversation(client, "Alpha");
    await createConversation(client, "Beta");
    saveSession({ token: "secret", conversationId: "conv-1", branchId: "branch-1", cursor: 9 });
    api.fetchMock.mockClear();
    const deferred = api.deferNext((path, method) => path.startsWith("/v1/conversations?") && method === "GET");
    const history = createMemoryHistory({ initialEntries: ["/chat/conv-1"] });
    render(<App history={history} />);
    await act(async () => { await deferred.requested; });
    act(() => history.push("/chat/conv-2"));
    await act(async () => { deferred.release(); });
    await waitFor(() => expect(screen.getByLabelText("Rama")).toHaveValue("branch-2"));
    expect(api.fetchMock.mock.calls.some(([path]) => path === "/v1/conversations/conv-1")).toBe(false);
    expect(loadSession().conversationId).toBe("conv-2");
  });

  it("successful append with failed refresh adopts its URL without prompting a duplicate write", async () => {
    const { api, history } = await setup("/");
    api.failNext((path, method) => path.startsWith("/v1/conversations?") && method === "GET");
    send("Saved once");
    expect(await screen.findByRole("alert")).toHaveTextContent("Mensaje guardado");
    await ready();
    expect(history.location.pathname).toBe("/chat/conv-3");
    expect(screen.getByLabelText("Mensaje")).toHaveValue("");
    expect(api.items).toHaveLength(1);
  });

  it("captured fork finishes without adding history or resetting the latest route", async () => {
    const { api, history } = await setup();
    const deferred = api.deferNext("POST", "/v1/conversations/conv-1/branches");
    fireEvent.click(screen.getByRole("button", { name: "Nueva rama" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await act(async () => { await deferred.requested; });
    act(() => history.push("/chat/conv-2"));
    await act(async () => { deferred.release(); });
    await waitFor(() => expect(screen.getByLabelText("Rama")).toHaveValue("branch-2"));
    expect(history.location.state.__TSR_index).toBe(1);
    expect(api.branches.filter((branch) => branch.conversation_id === "conv-1")).toHaveLength(2);
  });

  it("failed reconnect preserves the active session and successful disconnect returns to root", async () => {
    const { history } = await setup();
    fireEvent.click(screen.getByRole("button", { name: /Ajustes/ }));
    fireEvent.change(screen.getByLabelText("Clave de acceso"), { target: { value: "invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "Volver a conectar" }));
    await screen.findByRole("alert");
    await ready();
    expect(loadSession()).toEqual({ token: "secret", conversationId: "conv-1", branchId: "branch-1", cursor: 9 });
    expect(history.location.pathname).toBe("/chat/conv-1");
    fireEvent.click(screen.getByRole("button", { name: "Desconectar" }));
    await waitFor(() => expect(history.location.pathname).toBe("/"));
    expect(loadSession()).toEqual({ token: "", conversationId: "", branchId: "", cursor: 0 });
  });

  it("network failure remains visible without clearing credentials or retrying", async () => {
    const { api, history } = await setup();
    api.fetchMock.mockRejectedValueOnce(new TypeError("Network unavailable"));
    act(() => history.push("/chat/conv-2"));
    await screen.findByRole("alert");
    await waitFor(() => expect(history.location.pathname).toBe("/chat/conv-1"));
    await ready();
    expect(loadSession().token).toBe("secret");
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo conectar con el servidor.");
  });

});
