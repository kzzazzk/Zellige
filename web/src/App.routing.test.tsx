import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryHistory, createBrowserHistory } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { StrictMode } from "react";
import { App } from "./App";
import { apiFixture } from "./test/apiFixture";
import { createClient } from "./api/client";
import { createBranch, createConversation } from "./api/conversations";
import { loadSession, saveSession } from "./storage/session";

async function seed() {
  const api = apiFixture();
  const client = createClient(() => "secret");
  const a = (await createConversation(client, "Alpha")).data;
  const b = (await createConversation(client, "Beta")).data;
  saveSession({ token: "secret", conversationId: a.conversation.id, branchId: a.branch.id, cursor: 7 });
  api.fetchMock.mockClear();
  return { api, client, a, b };
}
const ready = () => waitFor(() => expect(screen.queryByRole("status", { name: "Sincronizando" })).not.toBeInTheDocument());

describe("URL workspace", () => {
  it("root without credentials has no server requests or creations", async () => {
    const api = apiFixture();
    render(<App history={createMemoryHistory({ initialEntries: ["/"] })} />);
    expect(screen.getByRole("button", { name: "Conectar servidor" })).toBeEnabled();
    await ready();
    expect(api.fetchMock).not.toHaveBeenCalled();
    expect(api.conversations).toHaveLength(0);
  });

  it("root overrides a saved conversation without reading or creating one", async () => {
    const { api } = await seed();
    render(<App history={createMemoryHistory({ initialEntries: ["/"] })} />);
    await ready();
    expect(loadSession()).toEqual({ token: "secret", conversationId: "", branchId: "", cursor: 7 });
    expect(api.fetchMock.mock.calls.map(([path]) => path)).toEqual(["/v1/conversations?archived=false&query=&offset=0&limit=50", "/v1/runtime-profiles"]);
  });

  it("restores matching branches and refreshes a concrete URL", async () => {
    const { client, a } = await seed();
    const branch = (await createBranch(client, a.conversation.id, "alternate", null)).data;
    saveSession({ token: "secret", conversationId: a.conversation.id, branchId: branch.id, cursor: 7 });
    const history = createMemoryHistory({ initialEntries: ["/chat/conv-1"] });
    const view = render(<App history={history} />);
    await waitFor(() => expect(screen.getByLabelText("Rama")).toHaveValue(branch.id));
    await ready();
    view.unmount();
    render(<App history={history} />);
    await waitFor(() => expect(screen.getByLabelText("Rama")).toHaveValue(branch.id));
  });

  it("direct mismatched and archived links resolve independently of the sidebar", async () => {
    const { api, b } = await seed();
    b.conversation.archived_at = 1;
    render(<App history={createMemoryHistory({ initialEntries: ["/chat/conv-2"] })} />);
    await waitFor(() => expect(screen.getByLabelText("Rama")).toHaveValue(b.branch.id));
    expect(api.fetchMock.mock.calls.some(([path]) => path === "/v1/conversations/conv-1")).toBe(false);
    expect(loadSession().conversationId).toBe("conv-2");
  });

  it.each([404, 401, 500])("cold route failure %s retains credentials and recovers without retries", async (status) => {
    const { api } = await seed();
    api.failNext("GET", "/v1/conversations/conv-2", "fixture_code", status);
    const history = createMemoryHistory({ initialEntries: ["/chat/conv-2"] });
    render(<App history={history} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Injected failure");
    await waitFor(() => expect(history.location.pathname).toBe("/"));
    await ready();
    expect(loadSession().token).toBe("secret");
    expect(api.fetchMock.mock.calls.filter(([path]) => path === "/v1/conversations/conv-2")).toHaveLength(1);
  });

  it("sidebar pushes once, POP restores branch hints and branch changes replace", async () => {
    const { client, a } = await seed();
    const branch = (await createBranch(client, a.conversation.id, "alternate", null)).data;
    const history = createMemoryHistory({ initialEntries: ["/chat/conv-1"] });
    render(<App history={history} />);
    await screen.findByLabelText("Rama");
    await ready();
    fireEvent.change(screen.getByLabelText("Rama"), { target: { value: branch.id } });
    await ready();
    await waitFor(() => expect(history.location.state.workspaceBranch).toBe(branch.id));
    expect(history.location.state.__TSR_index).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    await waitFor(() => expect(screen.getByLabelText("Rama")).toHaveValue("branch-2"));
    expect(history.location.pathname).toBe("/chat/conv-2");
    expect(history.location.state.__TSR_index).toBe(1);
    act(() => history.back());
    await waitFor(() => expect(screen.getByLabelText("Rama")).toHaveValue(branch.id));
    act(() => history.forward());
    await waitFor(() => expect(screen.getByLabelText("Rama")).toHaveValue("branch-2"));
  });

  it("coalesces deferred reads to the latest URL in Strict Mode", async () => {
    const { api } = await seed();
    const deferred = api.deferNext("GET", "/v1/conversations/conv-1");
    const history = createMemoryHistory({ initialEntries: ["/chat/conv-1"] });
    render(<StrictMode><App history={history} /></StrictMode>);
    await act(async () => { await deferred.requested; });
    act(() => history.push("/chat/conv-2"));
    await act(async () => { deferred.release(); });
    await waitFor(() => expect(screen.getByLabelText("Rama")).toHaveValue("branch-2"));
    expect(loadSession().conversationId).toBe("conv-2");
  });

  it("retains a disconnected deep link and resolves it on connection", async () => {
    await seed();
    sessionStorage.clear();
    const history = createMemoryHistory({ initialEntries: ["/chat/conv-2"] });
    render(<App history={history} />);
    fireEvent.click(screen.getByRole("button", { name: "Conectar servidor" }));
    fireEvent.change(screen.getByLabelText("Clave de acceso"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Conectar" }));
    await waitFor(() => expect(screen.getByLabelText("Rama")).toHaveValue("branch-2"));
    expect(history.location.pathname).toBe("/chat/conv-2");
  });
  it.each(["/chat/", "/chat/conv-1/extra", "/chat/%ZZ"]) ("malformed location %s recovers", async (path) => {
    apiFixture();
    const history = createMemoryHistory({ initialEntries: [path] });
    render(<App history={history} />);
    await screen.findByRole("alert");
    await waitFor(() => expect(history.location.pathname).toBe("/"));
  });

  it("missing saved branch falls back to the authoritative first branch", async () => {
    await seed();
    saveSession({ token: "secret", conversationId: "conv-1", branchId: "deleted-branch", cursor: 7 });
    render(<App history={createMemoryHistory({ initialEntries: ["/chat/conv-1"] })} />);
    await waitFor(() => expect(screen.getByLabelText("Rama")).toHaveValue("branch-1"));
    expect(loadSession().branchId).toBe("branch-1");
  });

  it("mobile selection closes the drawer and settings stays an overlay", async () => {
    await seed();
    const history = createMemoryHistory({ initialEntries: ["/chat/conv-1"] });
    render(<App history={history} />);
    await screen.findByLabelText("Rama");
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Abrir conversaciones" }));
    const drawer = await screen.findByRole("dialog", { name: "Conversaciones" });
    fireEvent.click(within(drawer).getByRole("button", { name: "Beta" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(history.location.pathname).toBe("/chat/conv-2"));
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /Ajustes/ }));
    await screen.findByRole("dialog");
    expect(history.location.pathname).toBe("/chat/conv-2");
    expect(history.location.state.__TSR_index).toBe(1);
  });

  it.each(["conv name", "conv-日本語", "conv%20name", "conv%name", "conv/segment"]) ("resolves opaque ID %s on direct open and sidebar navigation", async (id) => {
    const { api, a } = await seed();
    api.conversations[0].id = id;
    api.branches[0].conversation_id = id;
    const path = `/chat/${encodeURIComponent(id)}`;
    const history = createMemoryHistory({ initialEntries: [path] });
    render(<App history={history} />);
    await waitFor(() => expect(screen.getByLabelText("Rama")).toHaveValue(a.branch.id));
    await ready();
    expect(loadSession().conversationId).toBe(id);
    expect(api.fetchMock.mock.calls.filter(([request]) => request === `/v1/conversations/${encodeURIComponent(id)}`)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    await waitFor(() => expect(screen.getByLabelText("Rama")).toHaveValue("branch-2"));
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    await waitFor(() => expect(screen.getByLabelText("Rama")).toHaveValue(a.branch.id));
    await ready();
    expect(history.location.pathname).toBe(path);
    expect(screen.getByLabelText("Mensaje")).toBeEnabled();
    expect(loadSession().conversationId).toBe(id);
    expect(api.fetchMock.mock.calls.filter(([request]) => request === `/v1/conversations/${encodeURIComponent(id)}`)).toHaveLength(2);
  });

  it("encoded unknown ID recovers accessibly without retrying", async () => {
    const { api } = await seed();
    const history = createMemoryHistory({ initialEntries: ["/chat/unknown%20name"] });
    render(<App history={history} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No se encontró");
    await waitFor(() => expect(history.location.pathname).toBe("/"));
    await ready();
    expect(loadSession().token).toBe("secret");
    expect(api.fetchMock.mock.calls.filter(([request]) => request === "/v1/conversations/unknown%20name")).toHaveLength(1);
    expect(screen.getByLabelText("Mensaje")).toBeEnabled();
  });

  it("jumping between entries for the same conversation restores the destination branch and draft", async () => {
    const { client, a, api } = await seed();
    const branch = (await createBranch(client, a.conversation.id, "alternate", null)).data;
    const history = createMemoryHistory({ initialEntries: ["/chat/conv-1"] });
    render(<App history={history} />);
    await screen.findByLabelText("Rama");
    await ready();
    fireEvent.change(screen.getByLabelText("Mensaje"), { target: { value: "Main draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    await waitFor(() => expect(screen.getByLabelText("Rama")).toHaveValue("branch-2"));
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    await waitFor(() => expect(screen.getByLabelText("Rama")).toHaveValue(a.branch.id));
    api.fetchMock.mockClear();
    fireEvent.change(screen.getByLabelText("Rama"), { target: { value: branch.id } });
    await waitFor(() => expect(history.location.state.workspaceBranch).toBe(branch.id));
    await ready();
    expect(api.fetchMock.mock.calls.filter(([request]) => request === "/v1/conversations/conv-1")).toHaveLength(1);
    expect(history.location.state.__TSR_index).toBe(2);
    fireEvent.change(screen.getByLabelText("Mensaje"), { target: { value: "Alternate draft" } });
    act(() => history.go(-2));
    await waitFor(() => expect(screen.getByLabelText("Rama")).toHaveValue(a.branch.id));
    await ready();
    expect(screen.getByLabelText("Mensaje")).toHaveValue("Main draft");
    expect(loadSession().branchId).toBe(a.branch.id);
    act(() => history.go(2));
    await waitFor(() => expect(screen.getByLabelText("Rama")).toHaveValue(branch.id));
    expect(screen.getByLabelText("Mensaje")).toHaveValue("Alternate draft");
  });

  it("malformed-route recovery preserves the branch hint and draft on a later return", async () => {
    const { client, a } = await seed();
    const branch = (await createBranch(client, a.conversation.id, "alternate", null)).data;
    const history = createMemoryHistory({ initialEntries: ["/chat/conv-1"] });
    render(<App history={history} />);
    await screen.findByLabelText("Rama");
    await ready();
    fireEvent.change(screen.getByLabelText("Rama"), { target: { value: branch.id } });
    await waitFor(() => expect(history.location.state.workspaceBranch).toBe(branch.id));
    await ready();
    fireEvent.change(screen.getByLabelText("Mensaje"), { target: { value: "Alternate draft" } });
    act(() => history.push("/unknown/path"));
    await screen.findByRole("alert");
    await waitFor(() => expect(history.location.pathname).toBe("/chat/conv-1"));
    expect(history.location.state.workspaceBranch).toBe(branch.id);
    await ready();
    expect(screen.getByRole("alert")).toHaveTextContent("Ubicación no válida");
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    await waitFor(() => expect(screen.getByLabelText("Rama")).toHaveValue("branch-2"));
    act(() => history.back());
    await waitFor(() => expect(screen.getByLabelText("Rama")).toHaveValue(branch.id));
    expect(screen.getByLabelText("Mensaje")).toHaveValue("Alternate draft");
  });

  it("browser history POP wiring returns to the prior workspace", async () => {
    await seed();
    window.history.replaceState(null, "", "/chat/conv-1");
    const history = createBrowserHistory();
    const view = render(<App history={history} />);
    await screen.findByLabelText("Rama");
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    await waitFor(() => expect(screen.getByLabelText("Rama")).toHaveValue("branch-2"));
    act(() => window.history.back());
    await waitFor(() => expect(screen.getByLabelText("Rama")).toHaveValue("branch-1"));
    expect(window.location.pathname).toBe("/chat/conv-1");
    view.unmount();
    history.destroy();
  });

});
