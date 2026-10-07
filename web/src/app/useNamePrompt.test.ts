import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useNamePrompt } from "./useNamePrompt";
import type { Conversation } from "../api/types";

describe("useNamePrompt", () => {
  it("retains failed rename input and trims the title only for submission", async () => {
    const conversation: Conversation = {
      id: "conversation", title: "Original", created_at: 0, updated_at: 1,
      archived_at: null, deleted_at: null,
    };
    const changeConversation = vi.fn().mockResolvedValue(false);
    const { result } = renderHook(() => useNamePrompt({
      branchCount: 2, changeConversation, fork: vi.fn(),
    }));
    act(() => result.current.rename(conversation));
    expect(result.current.name).toBe("Original");
    act(() => result.current.setName("  Renamed  "));
    await act(() => result.current.submitName());
    expect(changeConversation).toHaveBeenCalledWith(conversation, { title: "Renamed" });
    expect(result.current.prompt).toEqual({ kind: "rename", conversation });
    expect(result.current.name).toBe("  Renamed  ");
    changeConversation.mockResolvedValue(true);
    await act(() => result.current.submitName());
    expect(result.current.prompt).toBeNull();
    act(() => result.current.fork("item"));
    expect(result.current.name).toBe("Rama 3");
  });
  it("rejects blank names, keeps failed prompts, and passes branch names unchanged", async () => {
    const fork = vi.fn().mockResolvedValue(false);
    const workspace = { branchCount: 0, fork, changeConversation: vi.fn() };
    const { result } = renderHook(() => useNamePrompt(workspace));
    act(() => result.current.fork(null));
    expect(result.current.name).toBe("Rama 1");
    act(() => result.current.setName("   "));
    await act(() => result.current.submitName());
    expect(fork).not.toHaveBeenCalled();
    act(() => result.current.setName("  Rama especial  "));
    await act(() => result.current.submitName());
    expect(fork).toHaveBeenCalledWith("  Rama especial  ", null);
    expect(result.current.prompt).toEqual({ kind: "branch", head: null });
    fork.mockResolvedValue(true);
    await act(() => result.current.submitName());
    expect(result.current.prompt).toBeNull();
  });
});
