import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RUN_AUTO_SYNC_INTERVAL_MS,
  useRunAutoSync,
} from "./useRunAutoSync";

afterEach(() => {
  vi.useRealTimers();
});

describe("useRunAutoSync", () => {
  it("syncs immediately, repeats while enabled and stops when disabled", async () => {
    vi.useFakeTimers();
    const synchronize = vi.fn().mockResolvedValue(true);
    const cancelInFlight = vi.fn();

    const { rerender } = renderHook(
      ({ enabled }) => useRunAutoSync(enabled, synchronize, cancelInFlight),
      { initialProps: { enabled: true } },
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(synchronize).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RUN_AUTO_SYNC_INTERVAL_MS);
    });
    expect(synchronize).toHaveBeenCalledTimes(2);

    rerender({ enabled: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RUN_AUTO_SYNC_INTERVAL_MS * 2);
    });
    expect(synchronize).toHaveBeenCalledTimes(2);
    expect(cancelInFlight).toHaveBeenCalledOnce();
  });

  it("does not schedule another tick after being disabled during an in-flight sync", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const synchronize = vi.fn(async () => {
      await pending;
      return true;
    });
    const cancelInFlight = vi.fn();

    const { rerender } = renderHook(
      ({ enabled }) => useRunAutoSync(enabled, synchronize, cancelInFlight),
      { initialProps: { enabled: true } },
    );
    expect(synchronize).toHaveBeenCalledTimes(1);

    rerender({ enabled: false });
    await act(async () => {
      release();
      await pending;
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RUN_AUTO_SYNC_INTERVAL_MS * 2);
    });
    expect(synchronize).toHaveBeenCalledTimes(1);
    expect(cancelInFlight).toHaveBeenCalledOnce();
  });
});
