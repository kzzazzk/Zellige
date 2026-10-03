import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Thread } from "../features/workspace/types";
import { Chat } from "./Chat";

function thread(id = "conversation", branchId = "main"): Thread {
  const branch = { id: branchId, conversation_id: id, name: branchId, head_item_id: "child" };
  return {
    conversation: { id, title: id, created_at: 0, updated_at: 0, deleted_at: null, archived_at: null },
    branch,
    branches: [branch],
    items: [{ id: "child", parent_item_id: "root", kind: "message", payload: { role: "user", content: [{ type: "text", text: "Original" }] }, created_at: 0 }],
    runs: [],
  };
}

function props() {
  return {
    thread: null as Thread | null,
    connected: true,
    busy: false,
    draft: "",
    setDraft: vi.fn(),
    profiles: [],
    profileId: "",
    setProfileId: vi.fn(),
    queuedNotice: false,
    sendMessage: vi.fn().mockResolvedValue(true),
    fork: vi.fn().mockResolvedValue(false),
    queueRun: vi.fn().mockResolvedValue(true),
    onSettings: vi.fn(),
    onFork: vi.fn(),
    onDetails: vi.fn(),
  };
}

describe("Chat coordination", () => {
  it("suggestions fill and focus the composer without sending", async () => {
    const p = props();
    render(<Chat {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Planifica un viaje de dos días" }));
    expect(p.setDraft).toHaveBeenCalledWith("Planifica un viaje de dos días");
    expect(screen.getByRole("textbox")).toHaveFocus();
    expect(p.sendMessage).not.toHaveBeenCalled();
    expect(p.queueRun).not.toHaveBeenCalled();
  });

  it("retains failed edit text across branches and hides it only in another conversation", async () => {
    const p = { ...props(), thread: thread() };
    const { rerender } = render(<Chat {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar en una nueva rama" }));
    const editor = screen.getByRole("textbox", { name: "Texto editado" });
    fireEvent.change(editor, { target: { value: "Replacement" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar en nueva rama" }));
    await waitFor(() => expect(p.fork).toHaveBeenCalledWith(expect.stringMatching(/^Edición /), "root", "Replacement"));
    expect(editor).toHaveValue("Replacement");
    rerender(<Chat {...p} thread={thread("conversation", "other-branch")} />);
    expect(screen.getByRole("textbox", { name: "Texto editado" })).toHaveValue("Replacement");
    rerender(<Chat {...p} thread={thread("different-conversation")} />);
    expect(screen.queryByRole("textbox", { name: "Texto editado" })).not.toBeInTheDocument();
    rerender(<Chat {...p} />);
    expect(screen.getByRole("textbox", { name: "Texto editado" })).toHaveValue("Replacement");
    p.fork.mockResolvedValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Guardar en nueva rama" }));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Texto editado" })).not.toBeInTheDocument());
  });
});
