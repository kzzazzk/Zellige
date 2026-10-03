import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { apiFixture } from "./test/apiFixture";

async function connect() {
  fireEvent.click(screen.getByRole("button", { name: "Conectar servidor" }));
  fireEvent.change(screen.getByLabelText("Clave de acceso"), {
    target: { value: "secret" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Conectar" }));
  await screen.findByText("Conectado");
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
}

async function send(text: string) {
  fireEvent.change(screen.getByLabelText("Mensaje"), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar mensaje" }));
  await waitFor(() => expect(screen.getByLabelText("Mensaje")).toHaveValue(""));
}

describe("Conversation app", () => {
  it("reuses the companion asset and persists the selected theme", () => {
    apiFixture();
    const view = render(<App />);
    expect(screen.getByRole("img", { name: "Zel, la mascota de Zellige" }))
      .toHaveAttribute("src", "/brand/zel/zel-hello.png");
    expect(document.documentElement).toHaveClass("dark");
    fireEvent.click(screen.getByRole("button", { name: "Conectar servidor" }));
    fireEvent.click(screen.getByRole("button", { name: "Usar tema claro" }));
    expect(document.documentElement).not.toHaveClass("dark");
    view.unmount();
    render(<App />);
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("keeps independent drafts for branches and new chats and clears them on disconnect", async () => {
    apiFixture();
    render(<App />);
    await connect();
    await send("Chat A");
    fireEvent.change(screen.getByLabelText("Mensaje"), {
      target: { value: "Borrador A" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Nueva conversación" }));
    expect(screen.getByLabelText("Mensaje")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Mensaje"), {
      target: { value: "Borrador nuevo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Chat A" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Mensaje")).toHaveValue("Borrador A"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Nueva rama" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Mensaje")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Rama"), {
      target: { value: "branch-1" },
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Mensaje")).toHaveValue("Borrador A"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Nueva conversación" }));
    expect(screen.getByLabelText("Mensaje")).toHaveValue("Borrador nuevo");
    fireEvent.click(screen.getByRole("button", { name: /Ajustes/ }));
    fireEvent.click(screen.getByRole("button", { name: "Desconectar" }));
    expect(screen.getByLabelText("Mensaje")).toHaveValue("");
  });

  it("connects, creates a conversation from the first message, renames it and restores history on reload", async () => {
    const api = apiFixture();
    const view = render(<App />);
    await connect();
    await send("Mi primera idea");
    expect(api.items[0].payload).toEqual({
      type: "message",
      role: "user",
      content: [{ type: "text", text: "Mi primera idea" }],
    });
    expect(api.items[0].parent_item_id).toBeNull();
    await send("Otro detalle");
    expect(api.items[1].parent_item_id).toBe(api.items[0].id);
    fireEvent.click(
      screen.getByRole("button", { name: "Renombrar conversación" }),
    );
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Ideas de producto" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(screen.getAllByText("Ideas de producto")).toHaveLength(2),
    );
    view.unmount();
    render(<App />);
    expect(await screen.findByText("Mi primera idea")).toBeInTheDocument();
    expect(screen.getByText("Otro detalle")).toBeInTheDocument();
  });

  it("preserves the draft and refreshes after a conflicting append without retrying", async () => {
    const api = apiFixture();
    render(<App />);
    await connect();
    await send("Primero");
    api.conflictNext();
    fireEvent.change(screen.getByLabelText("Mensaje"), {
      target: { value: "Borrador" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar mensaje" }));
    expect(
      await screen.findByText("Desde otro dispositivo"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Mensaje")).toHaveValue("Borrador");
    expect(screen.getByRole("alert")).toHaveTextContent("otro dispositivo");
    expect(
      api.fetchMock.mock.calls.filter(([path]) => path.endsWith("/items")),
    ).toHaveLength(2);
  });

  it("keeps a failed append draft and prevents duplicate sends while pending", async () => {
    const api = apiFixture();
    render(<App />);
    await connect();
    await send("Primero");
    const path = "/v1/conversations/conv-1/branches/branch-1/items";
    api.failNext("POST", path);
    fireEvent.change(screen.getByLabelText("Mensaje"), {
      target: { value: "Borrador" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar mensaje" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Mensaje")).toHaveValue("Borrador");
    expect(api.items).toHaveLength(1);
    const deferred = api.deferNext("POST", path);
    fireEvent.click(screen.getByRole("button", { name: "Guardar mensaje" }));
    await deferred.requested;
    fireEvent.click(screen.getByRole("button", { name: "Guardar mensaje" }));
    expect(api.items).toHaveLength(1);
    deferred.release();
    await waitFor(() => expect(screen.getByLabelText("Mensaje")).toHaveValue(""));
    expect(api.items).toHaveLength(2);
    expect(api.fetchMock.mock.calls.filter(([request]) => request === path)).toHaveLength(3);
  });

  it("does not preserve a sent draft when a follow-up read fails", async () => {
    const api = apiFixture();
    render(<App />);
    await connect();
    await send("Primero");
    api.failNext("GET", "/v1/conversations/conv-1/branches/branch-1/history");
    await send("Guardado");
    expect(await screen.findByRole("alert")).toHaveTextContent("Mensaje guardado.");
    expect(api.items).toHaveLength(2);
    expect(screen.getByLabelText("Mensaje")).toHaveValue("");
    expect(screen.getByText("Guardado")).toBeInTheDocument();
  });

  it("edits on a new branch and keeps the original message unchanged", async () => {
    const api = apiFixture();
    render(<App />);
    await connect();
    await send("Original");
    fireEvent.click(
      screen.getByRole("button", { name: "Editar en una nueva rama" }),
    );
    fireEvent.change(screen.getByLabelText("Texto editado"), {
      target: { value: "Revisado" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Guardar en nueva rama" }),
    );
    expect(
      await within(screen.getByLabelText("Historial")).findByText("Revisado"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByLabelText("Texto editado")).not.toBeInTheDocument(),
    );
    expect(api.branches).toHaveLength(2);
    expect(api.items[0].payload).toMatchObject({
      type: "message",
      content: [{ type: "text", text: "Original" }],
    });
    fireEvent.change(screen.getByLabelText("Rama"), {
      target: { value: "branch-1" },
    });
    expect(
      await within(screen.getByLabelText("Historial")).findByText("Original"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Revisado")).not.toBeInTheDocument();
  });

  it("archives and restores a conversation without deleting it", async () => {
    apiFixture();
    render(<App />);
    await connect();
    await send("Archivable");
    fireEvent.click(
      screen.getByRole("button", { name: "Opciones de Archivable" }),
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Archivar" }));
    await screen.findByText("Esta conversación está archivada.");
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Opciones de Archivable" }),
      ).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Restaurar" }));
    await waitFor(() =>
      expect(
        screen.queryByText("Esta conversación está archivada."),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Opciones de Archivable" }),
    ).toBeInTheDocument();
  });

  it("creates a selectable Codex local profile and persists a queued execution", async () => {
    const api = apiFixture();
    render(<App />);
    await connect();
    await send("Preparar tarea");
    fireEvent.click(screen.getByRole("button", { name: /Ajustes/ }));
    fireEvent.change(screen.getByLabelText("Nombre del perfil"), {
      target: { value: "Investigador" },
    });
    expect(screen.getByRole("option", { name: "Codex local" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tipo de perfil"), { target: { value: "codex" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear perfil" }));
    expect(
      await within(screen.getByRole("dialog")).findByText("Investigador"),
    ).toBeInTheDocument();
    expect(api.profiles[0].version.definition).toEqual({ mode: "code", harness: "codex", workspace: ".", sandbox: "workspace-write" });
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Cerrar",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Encolar" }));
    await waitFor(() => expect(api.runs).toHaveLength(1));
    expect(screen.getByRole("status")).toHaveTextContent("En cola");
    fireEvent.click(
      screen.getByRole("button", { name: "Detalles de la conversación" }),
    );
    expect(
      await within(screen.getByRole("dialog")).findByText("En cola"),
    ).toBeInTheDocument();
  });
});
