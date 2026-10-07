import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Item } from "../../api/types";
import { messageText } from "./messageText";
import { Message } from "./Message";
import { ChatEmptyState } from "./ChatEmptyState";
import { MessageComposer } from "./MessageComposer";

const item: Item = {
  id: "message-1", parent_item_id: null, kind: "message", created_at: 1000000,
  payload: { role: "user", content: [{ type: "text", text: "Hola" }] },
};

describe("chat presentation", () => {
  it("formats content blocks and falls back to payload JSON", () => {
    expect(messageText(item)).toBe("Hola");
    expect(messageText({ ...item, payload: { content: [
      { type: "text", text: "Text" }, { type: "image", artifact_id: "asset" }, { type: "file" },
    ] } })).toBe("Text\n[image: asset]\n[file: adjunto]");
    expect(messageText({ ...item, payload: { result: true } })).toBe(JSON.stringify({ result: true }, null, 2));
  });

  it("keeps message callbacks, busy controls and clipboard feedback", async () => {
    const onEdit = vi.fn();
    const onFork = vi.fn();
    const writeText = vi.fn().mockRejectedValueOnce(new Error("denied")).mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const view = render(<Message item={item} busy={false} onEdit={onEdit} onFork={onFork} />);
    fireEvent.click(screen.getByLabelText("Editar en una nueva rama"));
    fireEvent.click(screen.getByLabelText("Crear rama desde este mensaje"));
    expect(onEdit).toHaveBeenCalledWith(item);
    expect(onFork).toHaveBeenCalledWith(item);
    fireEvent.click(screen.getByLabelText("Copiar mensaje"));
    expect(await screen.findByRole("status")).toHaveTextContent("No se pudo copiar");
    fireEvent.click(screen.getByLabelText("Copiar mensaje"));
    await waitFor(() => expect(screen.getByLabelText("Copiar mensaje")).toHaveAttribute("title", "Copiado"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith("Hola");
    view.rerender(<Message item={item} busy onEdit={onEdit} onFork={onFork} />);
    expect(screen.getByLabelText("Editar en una nueva rama")).toBeDisabled();
    expect(screen.getByLabelText("Crear rama desde este mensaje")).toBeDisabled();
    expect(screen.getByLabelText("Copiar mensaje")).not.toBeDisabled();
  });

  it("switches empty-state connection and suggestion actions", () => {
    const onSettings = vi.fn();
    const onSuggestion = vi.fn();
    const view = render(<ChatEmptyState connected={false} busy={false} onSettings={onSettings} onSuggestion={onSuggestion} />);
    fireEvent.click(screen.getByRole("button", { name: "Conectar servidor" }));
    expect(onSettings).toHaveBeenCalledOnce();
    view.rerender(<ChatEmptyState connected busy={false} onSettings={onSettings} onSuggestion={onSuggestion} />);
    fireEvent.click(screen.getByRole("button", { name: "Planifica un viaje de dos días" }));
    expect(onSuggestion).toHaveBeenCalledWith("Planifica un viaje de dos días");
  });

  it("sends on Enter but not Shift+Enter or composing Enter", () => {
    const onSend = vi.fn();
    render(<MessageComposer composerRef={null} connected busy={false} draft="hello"
      onDraftChange={vi.fn()} onSend={onSend} profileId="" onProfileChange={vi.fn()}
      profiles={[]} hasThread={false} onQueueRun={vi.fn()} queuedNotice={false} onDetails={vi.fn()} />);
    const input = screen.getByLabelText("Mensaje");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSend).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByLabelText("Guardar mensaje"));
    expect(onSend).toHaveBeenCalledTimes(2);
  });
});
