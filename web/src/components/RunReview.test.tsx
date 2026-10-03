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
              head_before: "1234567890abcdef",
              head_after: "abcdef1234567890",
              dirty_before: true,
              dirty_after: true,
              status_after: [{ code: " M", path: "src/app.ts" }],
              working_diff: [{ path: "src/app.ts", added: 3, deleted: 1 }],
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

  it("renders nothing for Phase 5 results without evidence", () => {
    const { container } = render(<RunReview run={run({ summary: "Legacy result" })} />);
    expect(container).toBeEmptyDOMElement();
  });
});
