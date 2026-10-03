import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Run } from "../api/types";
import { Inspector } from "./Inspector";

const base: Run = {
  id: "run-1", conversation_id: "conv-1", branch_id: "branch-1", input_head_item_id: "item-1",
  runtime_profile_version_id: "profile-1", provider_session_id: null, status: "queued",
  request: {}, result: null, created_at: 1, started_at: null, completed_at: null,
  context_pack_version_ids: [],
};

describe("run inspector", () => {
  it.each([
    ["queued", "En cola", null, null],
    ["running", "En ejecución", null, null],
    ["completed", "Completada", { summary: "Implemented task" }, "Implemented task"],
    ["failed", "Fallida", { error: "Codex failed" }, "Codex failed"],
    ["failed", "Fallida", { error: { message: "Nested failure" } }, "Nested failure"],
    ["failed", "Fallida", { message: "Useful message" }, "Useful message"],
    ["cancelled", "Cancelada", null, null],
  ] as const)("shows %s with a useful result", (status, label, result, message) => {
    render(<Inspector runs={[{ ...base, status, result }]} profiles={[]} connected busy={false}
      lastStatus={null} lastResponse={null} cursor={0} changes={[]} hasMoreChanges={false}
      readChanges={vi.fn(async () => true)} onClose={vi.fn()} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    if (message) expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sincronizar cambios" })).toBeEnabled();
  });
});
