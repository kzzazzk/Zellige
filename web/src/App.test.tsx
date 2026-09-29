import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const branch = (head: string | null) => ({ id: "branch-1", conversation_id: "conv-1", name: "main", head_item_id: head });
const item = (id: string, parent: string | null, text: string) => ({ id, parent_item_id: parent, kind: "message", payload: { type: "message", role: "user", content: [{ type: "text", text }] }, created_at: 1 });

describe("MVP console", () => {
  beforeEach(() => sessionStorage.clear());

  it("shows disconnected health", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<App />);
    expect(await screen.findByText("Servidor: sin conexión")).toBeInTheDocument();
  });

  it("creates a conversation, appends with the current head, restores history after reload, and reads changes", async () => {
    const sent: Array<{ path: string; body?: Record<string, unknown>; authorization: string | null }> = [];
    let messages = [item("item-1", null, "hola")];
    const fetchMock = vi.fn().mockImplementation((path: string, options?: RequestInit) => {
      const headers = new Headers(options?.headers);
      const body = options?.body ? JSON.parse(String(options.body)) as Record<string, unknown> : undefined;
      sent.push({ path, body, authorization: headers.get("Authorization") });
      if (path === "/health") return Promise.resolve(json({ status: "ok", database: "ok" }));
      if (path === "/v1/conversations") return Promise.resolve(json({ conversation: { id: "conv-1", title: "Prueba" }, branch: branch(null) }, 201));
      if (path.endsWith("/items")) {
        const next = item(`item-${messages.length + 1}`, body?.expected_head_item_id as string | null, "segundo");
        messages = [...messages, next];
        return Promise.resolve(json(next, 201));
      }
      if (path.endsWith("/history")) return Promise.resolve(json({ branch: branch(messages.at(-1)?.id ?? null), items: messages }));
      if (path.startsWith("/v1/changes?")) return Promise.resolve(json({ changes: [{ seq: 1, entity_type: "item", entity_id: "item-1", operation: "upsert", data: {}, conversation_id: "conv-1" }], next_cursor: 1, has_more: false }));
      throw new Error(`Unexpected ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<App />);
    expect(await screen.findByText("Servidor: conectado")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Token API del servidor"), { target: { value: "secret" } });
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Prueba" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear conversación" }));
    await waitFor(() => expect(screen.getByText("conv-1")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Nuevo mensaje de usuario"), { target: { value: "segundo" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir mensaje" }));
    await waitFor(() => expect(screen.getByText("segundo")).toBeInTheDocument());
    const append = sent.find((entry) => entry.path.endsWith("/items"));
    expect(append?.authorization).toBe("Bearer secret");
    expect(append?.body).toEqual({ expected_head_item_id: null, kind: "message", payload: { type: "message", role: "user", content: [{ type: "text", text: "segundo" }] } });
    fireEvent.click(screen.getByRole("button", { name: "Consultar cambios" }));
    await waitFor(() => expect(screen.getByText(/Consulta manual global desde el cursor 1/)).toBeInTheDocument());
    view.unmount();
    render(<App />);
    expect(await screen.findByText("hola")).toBeInTheDocument();
    expect(screen.getByText("segundo")).toBeInTheDocument();
    expect(sent.some((entry) => entry.path.includes("cursor=0"))).toBe(true);
  });

  it("refreshes on 409, preserves the draft, and does not retry the append", async () => {
    let head = "item-1";
    const paths: string[] = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation((path: string) => {
      paths.push(path);
      if (path === "/health") return Promise.resolve(json({ status: "ok", database: "ok" }));
      if (path.endsWith("/history")) return Promise.resolve(json({ branch: branch(head), items: head === "item-1" ? [item("item-1", null, "primero")] : [item("item-1", null, "primero"), item("item-2", "item-1", "externo")] }));
      if (path.endsWith("/items")) { head = "item-2"; return Promise.resolve(json({ error: { code: "head_conflict", message: "branch head has changed", details: { expected_head_item_id: "item-1", actual_head_item_id: "item-2" } } }, 409)); }
      throw new Error(`Unexpected ${path}`);
    }));
    render(<App />);
    fireEvent.change(screen.getByLabelText("Token API del servidor"), { target: { value: "secret" } });
    fireEvent.click(screen.getByText("Abrir conversación existente por ID"));
    fireEvent.change(screen.getByLabelText("ID de conversación"), { target: { value: "conv-1" } });
    fireEvent.change(screen.getByLabelText("ID de rama"), { target: { value: "branch-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    expect(await screen.findByText("primero")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nuevo mensaje de usuario"), { target: { value: "mi borrador" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir mensaje" }));
    expect(await screen.findByText(/Conflicto 409/)).toBeInTheDocument();
    expect(await screen.findByText("externo")).toBeInTheDocument();
    expect(screen.getByLabelText("Nuevo mensaje de usuario")).toHaveValue("mi borrador");
    expect(paths.filter((path) => path.endsWith("/items"))).toHaveLength(1);
  });

  it("creates a profile and shows a queued run without implying execution", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((path: string) => {
      if (path === "/health") return Promise.resolve(json({ status: "ok", database: "ok" }));
      if (path.endsWith("/history")) return Promise.resolve(json({ branch: branch(null), items: [] }));
      if (path === "/v1/runtime-profiles") return Promise.resolve(json({ runtime_profile: { id: "profile-1" }, version: { id: "version-1", version: 1 } }, 201));
      if (path === "/v1/runs") return Promise.resolve(json({ id: "run-1", status: "queued", input_head_item_id: null, runtime_profile_version_id: "version-1", context_pack_version_ids: [] }, 201));
      throw new Error(`Unexpected ${path}`);
    }));
    render(<App />);
    fireEvent.change(screen.getByLabelText("Token API del servidor"), { target: { value: "secret" } });
    fireEvent.click(screen.getByText("Abrir conversación existente por ID"));
    fireEvent.change(screen.getByLabelText("ID de conversación"), { target: { value: "conv-1" } });
    fireEvent.change(screen.getByLabelText("ID de rama"), { target: { value: "branch-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    await waitFor(() => expect(screen.getByText("conv-1")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Nombre del perfil"), { target: { value: "prueba" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear perfil" }));
    await waitFor(() => expect(screen.getByText("version-1")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Crear run" }));
    await waitFor(() => expect(screen.getAllByRole("status").find((element) => element.textContent?.includes("run-1"))).toHaveTextContent("queued"));
  });
});
