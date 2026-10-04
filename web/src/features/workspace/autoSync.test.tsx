import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceNavigation } from "../../app/useWorkspaceNavigation";
import { createClient } from "../../api/client";
import { createConversation } from "../../api/conversations";
import { createProfile } from "../../api/runs";
import type { Change, Changes } from "../../api/types";
import { saveSession } from "../../storage/session";
import { apiFixture } from "../../test/apiFixture";
import { createQueryWrapper } from "../../test/queryWrapper";
import { useWorkspace } from "../useWorkspace";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function runChange(seq = 12): Change {
  return {
    seq,
    conversation_id: "conv-1",
    entity_type: "run",
    entity_id: "run-1",
    operation: "upsert",
    changed_at: 1,
    data: {},
  };
}

function changesPage(changes: Change[], nextCursor = 12): Changes {
  return { changes, next_cursor: nextCursor, has_more: false };
}

function interceptChanges(
  api: ReturnType<typeof apiFixture>,
  response: () => Changes,
) {
  const original = api.fetchMock.getMockImplementation()!;
  api.fetchMock.mockImplementation(async (path, options) => {
    if (path.startsWith("/v1/changes?")) return json(response());
    return original(path, options);
  });
}

async function setup() {
  const api = apiFixture();
  const client = createClient(() => "secret");
  await createConversation(client, "Alpha");
  await createProfile(client, "Primary");
  saveSession({ token: "", conversationId: "", branchId: "", cursor: 11 });

  const provider = createQueryWrapper();
  const hook = renderHook(() => useWorkspace(), provider);
  await act(async () => {
    expect(await hook.result.current.connect("secret")).toBe(true);
  });
  await act(async () => {
    expect(await hook.result.current.selectConversation("conv-1")).toBe(true);
  });
  act(() => {
    hook.result.current.setProfileId(hook.result.current.profiles[0].version.id);
  });
  api.fetchMock.mockClear();
  return { api, ...hook };
}

describe("active Run automatic synchronization", () => {
  it("publishes a terminal Run and Phase 6 evidence without manual synchronization", async () => {
    const { api, result } = await setup();
    let served = false;
    interceptChanges(api, () => {
      if (!served) {
        served = true;
        const run = api.runs[0];
        run.status = "completed";
        run.started_at = 2;
        run.completed_at = 3;
        run.result = {
          summary: "Done automatically",
          evidence: {
            schema_version: 1,
            commands: [{
              kind: "test",
              command: "npm test",
              command_truncated: false,
              status: "completed",
              exit_code: 0,
            }],
            commands_truncated: false,
            file_changes: [],
            file_changes_truncated: false,
            git: { available: false },
          },
        };
        return changesPage([runChange()]);
      }
      return changesPage([], 12);
    });

    await act(async () => {
      expect(await result.current.queueRun()).toBe(true);
    });

    await waitFor(
      () => expect(result.current.thread?.runs[0].status).toBe("completed"),
      { timeout: 2_500 },
    );
    expect(result.current.thread?.runs[0].result).toMatchObject({
      summary: "Done automatically",
      evidence: {
        commands: [{ kind: "test", exit_code: 0 }],
      },
    });
    expect(result.current.cursor).toBe(12);
    expect(result.current.busy).toBe(false);
    expect(
      api.fetchMock.mock.calls.some(([path]) => path.startsWith("/v1/changes?")),
    ).toBe(true);
  });

  it("discards an in-flight background sync when the user changes workspace state", async () => {
    const { api, result } = await setup();
    interceptChanges(api, () => changesPage([runChange()]));
    const pendingThreadRead = api.deferNext("GET", "/v1/conversations/conv-1");

    await act(async () => {
      expect(await result.current.queueRun()).toBe(true);
      await pendingThreadRead.requested;
    });

    expect(result.current.thread?.runs[0].status).toBe("queued");
    expect(result.current.busy).toBe(false);

    act(() => {
      result.current.newChat();
    });
    expect(result.current.thread).toBeNull();

    await act(async () => {
      pendingThreadRead.release();
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.thread).toBeNull());
    expect(result.current.cursor).toBe(11);
    expect(result.current.busy).toBe(false);
  });

  it("rejects publication when the live route request changes before React cleanup", async () => {
    const api = apiFixture();
    const client = createClient(() => "secret");
    await createConversation(client, "Alpha");
    await createProfile(client, "Primary");
    saveSession({ token: "", conversationId: "", branchId: "", cursor: 11 });

    let request = "route-alpha";
    const navigation: WorkspaceNavigation = {
      id: "conv-1",
      invalid: false,
      branch: "branch-1",
      locationRequest: "route-alpha",
      request: () => request,
      navigate: vi.fn(),
      selectConversation: async () => true,
    };
    const provider = createQueryWrapper();
    const hook = renderHook(() => useWorkspace(navigation), provider);

    await act(async () => {
      expect(await hook.result.current.connect("secret")).toBe(true);
    });
    await waitFor(() =>
      expect(hook.result.current.thread?.conversation.id).toBe("conv-1"),
    );
    act(() => {
      hook.result.current.setProfileId(
        hook.result.current.profiles[0].version.id,
      );
    });

    api.fetchMock.mockClear();
    interceptChanges(api, () => changesPage([runChange()]));
    const pendingThreadRead = api.deferNext("GET", "/v1/conversations/conv-1");

    await act(async () => {
      expect(await hook.result.current.queueRun()).toBe(true);
      await pendingThreadRead.requested;
    });
    expect(hook.result.current.thread?.runs[0].status).toBe("queued");

    // Change the router's live request without rerendering. The commit guard must
    // observe this directly instead of relying on React effect cleanup timing.
    request = "route-beta";
    await act(async () => {
      pendingThreadRead.release();
      await Promise.resolve();
    });

    expect(hook.result.current.cursor).toBe(11);
    expect(hook.result.current.thread?.runs[0].status).toBe("queued");
    expect(hook.result.current.busy).toBe(false);
  });
});
