import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Run } from "../api/types";
import { profileDefinition } from "../api/runs";
import { Inspector } from "./Inspector";
import { Settings } from "./Settings";

describe("local Codex execution UI", () => {
  it("maps the Codex profile kind to the constrained worker definition", () => {
    expect(profileDefinition("codex")).toEqual({ mode: "code", harness: "codex", workspace: ".", sandbox: "workspace-write" });
    expect(profileDefinition("research")).toEqual({ mode: "research" });
  });

  it("offers Codex local and submits that profile kind", async () => {
    const addProfile = vi.fn(async () => true);
    render(<Settings token="secret" connected busy={false} profiles={[]} failure={null}
      connect={async () => true} disconnect={vi.fn()} addProfile={addProfile}
      onClose={vi.fn()} dark={false} onTheme={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Tipo de perfil"), { target: { value: "codex" } });
    fireEvent.change(screen.getByLabelText("Nombre del perfil"), { target: { value: "Local worker" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Crear perfil" })); });
    expect(addProfile).toHaveBeenCalledWith("Local worker", "codex");
    expect(screen.getByText(/Codex local requiere iniciar un worker/)).toBeInTheDocument();
  });

  it("shows translated lifecycle states and terminal result text", () => {
    const base: Run = {
      id: "run-1", conversation_id: "conv-1", branch_id: "branch-1",
      input_head_item_id: "item-1", runtime_profile_version_id: "profilev-1",
      provider_session_id: null, status: "queued", request: {}, result: null,
      created_at: 1, started_at: null, completed_at: null, context_pack_version_ids: [],
    };
    const runs: Run[] = [
      { ...base, id: "running", status: "running", started_at: 2 },
      { ...base, id: "completed", status: "completed", result: { summary: "Tests passed" }, started_at: 2, completed_at: 3 },
      { ...base, id: "failed", status: "failed", result: { error: "Codex failed" }, started_at: 2, completed_at: 3 },
    ];
    render(<Inspector runs={runs} profiles={[]} connected busy={false} lastStatus={null}
      lastResponse={null} cursor={0} changes={[]} hasMoreChanges={false}
      readChanges={async () => true} onClose={vi.fn()} />);
    expect(screen.getByText("En ejecución")).toBeInTheDocument();
    expect(screen.getByText("Completada")).toBeInTheDocument();
    expect(screen.getByText("Fallida")).toBeInTheDocument();
    expect(screen.getByText("Tests passed")).toBeInTheDocument();
    expect(screen.getByText("Codex failed")).toBeInTheDocument();
  });
});
