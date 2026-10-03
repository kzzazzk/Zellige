import { useCallback, useRef, useState } from "react";
import type { ApiResult } from "../../api/types";
import { describeError } from "./errors";
import type { Failure } from "./types";

export function useWorkspaceOperation(initiallyLocked: boolean) {
  const [busy, setBusy] = useState(initiallyLocked);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [lastResponse, setLastResponse] = useState<unknown>(null);
  const [lastStatus, setLastStatus] = useState<number | null>(null);
  const actionRunning = useRef(initiallyLocked);
  function record<T>(result: ApiResult<T>): T {
    setLastStatus(result.status);
    setLastResponse(result.data);
    return result.data;
  }

  async function perform(action: () => Promise<void>): Promise<boolean> {
    if (actionRunning.current) return false;
    actionRunning.current = true;
    setBusy(true);
    setFailure(null);
    try {
      await action();
      return true;
    } catch (error) {
      const detail = describeError(error);
      setFailure(detail);
      setLastStatus(detail.status);
      setLastResponse({ error: detail });
      return false;
    } finally {
      actionRunning.current = false;
      setBusy(false);
    }
  }

  const releaseBootstrap = useCallback(() => {
    actionRunning.current = false;
    setBusy(false);
  }, []);
  return { busy, failure, lastResponse, lastStatus, actionRunning, record, perform,
    setFailure, setLastResponse, setLastStatus, releaseBootstrap };
}

export type Operation = ReturnType<typeof useWorkspaceOperation>;
