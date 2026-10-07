import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Run } from "../api/types";
import { RunReview } from "./RunReview";

function run(result: Run["result"]): Run {
  return {
    id: "run-1",
    conversation_id: "conv-1",
    branch_id: "branch-1",
    input_head_item_id: "item-1",
    runtime_profile_version_id: "profilev-1",
    provider_session_id: null,
    status: "completed",
    request: {},
    result,
    context_pack_version_ids: [],
    created_at: 1,
    started_at: 2,
    completed_at: 3,
  };
}

describe("RunReview", () => {
  it("renders exact command, test and Git evidence without raw output", () => {
    render(
      <RunReview
        run={run({
          summary: "Done",
          evidence: {
            schema_version: 1,
            commands: [
              {
                kind: "test",
                command: "npm test",
                status: "completed",
                exit_code: 0,
                duration_ms: 120,
              },
              {
                kind: "command",
                command: "git status --short",
                status: "completed",
                exit_code: 0,
              },
            ],
            commands_truncated: false,
            file_changes: [{ path: "src/app.ts", kind: "update" }],
            file_changes_truncated: false,
            git: {
              available: true,
              complete: true,
              head_before: "1234567890abcdef",
              head_after: "abcdef1234567890",
              head_before_available: true,
              head_after_available: true,
              dirty_before: true,
              dirty_after: true,
              status_before_available: true,
              status_after_available: true,
              status_before_truncated: false,
              status_after_truncated: false,
              status_after: [{ code: " M", path: "src/app.ts" }],
              working_diff_before_available: true,
              working_diff_available: true,
              working_diff_before_truncated: false,
              working_diff_truncated: false,
              working_diff: [{ path: "src/app.ts", added: 3, deleted: 1 }],
              committed_diff_available: true,
              committed_diff_truncated: false,
              committed_diff: [{ path: "README.md", added: 2, deleted: 0 }],
            },
          },
        })}
      />,
    );

    expect(screen.getByText("Revisión de ejecución")).toBeInTheDocument();
    expect(screen.getByText("Prueba")).toBeInTheDocument();
    expect(screen.getByText("Comando")).toBeInTheDocument();
    expect(screen.getByText("npm test")).toBeInTheDocument();
    expect(screen.getAllByText("✓ exit 0")).toHaveLength(2);
    expect(screen.getByText("Cambios reportados por Codex")).toBeInTheDocument();
    expect(screen.getAllByText("src/app.ts").length).toBeGreaterThan(1);
    expect(screen.getByText(/workspace ya tenía cambios/)).toBeInTheDocument();
    expect(screen.getByText("Cambios sin commit")).toBeInTheDocument();
    expect(screen.getByText("Cambios entre commits")).toBeInTheDocument();
    expect(screen.getByText(/HEAD 12345678 → abcdef12/)).toBeInTheDocument();
  });

  it("states honestly when Git evidence is unavailable", () => {
    render(
      <RunReview
        run={run({
          evidence: {
            schema_version: 1,
            commands: [],
            file_changes: [],
            git: { available: false },
          },
        })}
      />,
    );
    expect(screen.getByText("No disponible para este workspace.")).toBeInTheDocument();
  });

  it("distinguishes command text truncation from command list truncation", () => {
    render(<RunReview run={run({ evidence: {
      commands: [{ command: "pytest clipped", kind: "test", exit_code: 0, command_truncated: true }],
      commands_truncated: false,
      git: { available: false },
    } })} />);
    expect(screen.getByText("El texto de este comando fue truncado.")).toBeInTheDocument();
    expect(screen.queryByText("La lista de comandos fue truncada.")).not.toBeInTheDocument();
  });

  it.each([
    ["status_after", "El estado Git al terminar no está disponible."],
    ["working_diff", "Los cambios sin commit no están disponibles."],
    ["committed_diff", "Los cambios entre commits no están disponibles."],
  ])("does not claim a clean workspace when %s failed", (field, message) => {
    render(<RunReview run={run({ evidence: { git: {
      available: true, complete: false, dirty_after: field === "status_after" ? null : false,
      status_after: [], working_diff: [], committed_diff: [],
      [field]: null, [`${field}_available`]: false,
    } } })} />);
    expect(screen.getByText(/Evidencia Git incompleta/)).toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByText(/terminó sin cambios Git pendientes/)).not.toBeInTheDocument();
  });

  it.each([
    ["status_before_truncated", "La lista de estado Git fue truncada."],
    ["status_after_truncated", "La lista de estado Git fue truncada."],
    ["working_diff_before_truncated", "La lista de cambios Git fue truncada."],
    ["working_diff_truncated", "La lista de cambios Git fue truncada."],
    ["committed_diff_truncated", "La lista de cambios Git fue truncada."],
  ])("marks incomplete Git lists for %s", (field, message) => {
    render(<RunReview run={run({ evidence: { git: {
      available: true, complete: false, dirty_after: false,
      status_after: [], working_diff: [], committed_diff: [], [field]: true,
    } } })} />);
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByText(/Evidencia Git incompleta/)).toBeInTheDocument();
    expect(screen.queryByText(/terminó sin cambios Git pendientes/)).not.toBeInTheDocument();
  });

  it("does not claim complete Git evidence for older results without completeness flags", () => {
    render(<RunReview run={run({ evidence: { git: {
      available: true, dirty_after: false, status_after: [], working_diff: [], committed_diff: [],
    } } })} />);
    expect(screen.getByText(/Evidencia Git incompleta/)).toBeInTheDocument();
    expect(screen.queryByText(/terminó sin cambios Git pendientes/)).not.toBeInTheDocument();
  });

  it("reports a clean workspace only with complete, empty Git evidence", () => {
    render(<RunReview run={run({ evidence: { git: {
      available: true, complete: true, dirty_after: false,
      status_after: [], working_diff: [], committed_diff: [],
    } } })} />);
    expect(screen.getByText(/terminó sin cambios Git pendientes/)).toBeInTheDocument();
    expect(screen.queryByText(/Evidencia Git incompleta/)).not.toBeInTheDocument();
  });

  it("shows individual command truncation", () => {
    render(
      <RunReview
        run={run({
          evidence: {
            schema_version: 1,
            commands: [{
              kind: "command",
              command: "x".repeat(2048),
              command_truncated: true,
              status: "completed",
              exit_code: 0,
            }],
            commands_truncated: false,
            file_changes: [],
            git: { available: false },
          },
        })}
      />,
    );
    expect(screen.getByText("El texto de este comando fue truncado.")).toBeInTheDocument();
  });

  it("does not turn incomplete Git reads into a clean-workspace claim", () => {
    render(
      <RunReview
        run={run({
          evidence: {
            schema_version: 1,
            commands: [],
            file_changes: [],
            git: {
              available: true,
              complete: false,
              dirty_before: false,
              dirty_after: false,
              status_after: [],
              status_after_available: true,
              working_diff: null,
              working_diff_available: false,
              committed_diff: [],
              committed_diff_available: true,
              status_before_truncated: false,
              status_after_truncated: false,
              working_diff_before_truncated: false,
              working_diff_truncated: false,
              committed_diff_truncated: false,
            },
          },
        })}
      />,
    );
    expect(screen.getByText(/Evidencia Git incompleta/)).toBeInTheDocument();
    expect(screen.getByText("Los cambios sin commit no están disponibles.")).toBeInTheDocument();
    expect(screen.queryByText("El workspace terminó sin cambios Git pendientes.")).not.toBeInTheDocument();
  });

  it("renders nothing for Phase 5 results without evidence", () => {
    const { container } = render(<RunReview run={run({ summary: "Legacy result" })} />);
    expect(container).toBeEmptyDOMElement();
  });
});
