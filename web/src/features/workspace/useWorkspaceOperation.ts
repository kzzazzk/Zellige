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
  const backgroundRunning = useRef(false);
  const foregroundRevision = useRef(0);

  function record<T>(result: ApiResult<T>): T {
    setLastStatus(result.status);
    setLastResponse(result.data);
    return result.data;
  }

  function supersedeBackground() {
    foregroundRevision.current += 1;
  }

  async function perform(action: () => Promise<void>): Promise<boolean> {
    if (actionRunning.current) return false;

    supersedeBackground();
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

  function performBackground(
    action: (isCurrent: () => boolean) => Promise<void>,
  ): Promise<boolean> {
    if (actionRunning.current || backgroundRunning.current)
      return Promise.resolve(false);

    const revision = foregroundRevision.current;
    backgroundRunning.current = true;
    const isCurrent = () =>
      !actionRunning.current && foregroundRevision.current === revision;

    return (async () => {
      try {
        await action(isCurrent);
        return true;
      } catch {
        return false;
      } finally {
        backgroundRunning.current = false;
      }
    })();
  }

  const releaseBootstrap = useCallback(() => {
    actionRunning.current = false;
    setBusy(false);
  }, []);

  return {
    busy,
    failure,
    lastResponse,
    lastStatus,
    actionRunning,
    record,
    perform,
    performBackground,
    supersedeBackground,
    setFailure,
    setLastResponse,
    setLastStatus,
    releaseBootstrap,
  };
}

export type Operation = ReturnType<typeof useWorkspaceOperation>;
