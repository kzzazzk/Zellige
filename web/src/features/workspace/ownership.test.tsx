import { createQueryWrapper } from "../../test/queryWrapper";
import { StrictMode, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/types";
import { loadSession, saveSession } from "../../storage/session";
import { apiFixture } from "../../test/apiFixture";
import { useWorkspace } from "../useWorkspace";
import { useDrafts } from "./useDrafts";
import { useWorkspaceOperation } from "./useWorkspaceOperation";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("workspace ownership", () => {
  it("acquires synchronously, records selectively, and releases after failures", async () => {
    const { result } = renderHook(() => useWorkspaceOperation(false));
    const pending = deferred();
    const rejected = vi.fn(async () => {});
    let first!: Promise<boolean>;
    act(() => {
      result.current.record({ status: 201, data: { saved: true } });
      first = result.current.perform(() => pending.promise);
    });
    expect(result.current.busy).toBe(true);
    expect(await result.current.perform(rejected)).toBe(false);
    expect(rejected).not.toHaveBeenCalled();
    await act(async () => { pending.resolve(); expect(await first).toBe(true); });
    expect(result.current.lastStatus).toBe(201);
    await act(async () => {
      expect(await result.current.perform(async () => { throw new ApiError("conflict", 409); })).toBe(false);
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.lastStatus).toBe(409);
    expect(result.current.lastResponse).toEqual({ error: result.current.failure });
    await act(async () => { expect(await result.current.perform(async () => {})).toBe(true); });
    expect(result.current.failure).toBeNull();
  });

  it("initial bootstrap lock rejects without clearing an existing failure", async () => {
    const { result } = renderHook(() => useWorkspaceOperation(true));
    const failure = { message: "restore", status: 401, code: null, details: null };
    act(() => result.current.setFailure(failure));
    expect(await result.current.perform(async () => {})).toBe(false);
    expect(result.current.failure).toBe(failure);
    act(() => result.current.releaseBootstrap());
    await act(async () => { expect(await result.current.perform(async () => {})).toBe(true); });
  });

  it("transfers and clears explicit draft keys without affecting the visible or unrelated draft", () => {
    const { result, rerender } = renderHook(({ key }) => useDrafts(key), { initialProps: { key: "new" } });
    act(() => result.current.setDraft("first"));
    act(() => result.current.transfer("new", "created", "first"));
    expect(result.current.draft).toBe("");
    rerender({ key: "other" });
    act(() => result.current.setDraft("other draft"));
    act(() => result.current.clear("created"));
    expect(result.current.draft).toBe("other draft");
    rerender({ key: "created" });
    expect(result.current.draft).toBe("");
    act(() => result.current.reset());
    rerender({ key: "other" });
    expect(result.current.draft).toBe("");
  });

  it("does not persist an empty selection during bootstrap and ignores completion after unmount", async () => {
    const api = apiFixture();
    const saved = { token: "secret", conversationId: "missing", branchId: "saved-branch", cursor: 17 };
    saveSession(saved);
    const release = api.deferNext("GET", "/v1/runtime-profiles");
    const { result, unmount } = renderHook(useWorkspace, createQueryWrapper());
    expect(result.current.busy).toBe(true);
    expect(await result.current.sendMessage("blocked")).toBe(false);
    expect(loadSession()).toEqual(saved);
    unmount();
    await act(async () => { release(); await new Promise((done) => setTimeout(done, 0)); });
    expect(loadSession()).toEqual(saved);
    expect(result.current.connected).toBe(false);
  });

  it("restores safely through the Strict Mode lifecycle probe and swallows missing-conversation 404", async () => {
    apiFixture();
    saveSession({ token: "secret", conversationId: "missing", branchId: "missing", cursor: 23 });
    const { wrapper: QueryWrapper } = createQueryWrapper();
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode><QueryWrapper>{children}</QueryWrapper></StrictMode>;
    const { result } = renderHook(useWorkspace, { wrapper });
    await waitFor(() => expect(result.current.connected).toBe(true));
    expect(result.current.busy).toBe(false);
    expect(result.current.failure).toBeNull();
    expect(result.current.thread).toBeNull();
    expect(loadSession().cursor).toBe(23);
    await act(async () => { expect(await result.current.sendMessage("after restore")).toBe(true); });
  });
});
