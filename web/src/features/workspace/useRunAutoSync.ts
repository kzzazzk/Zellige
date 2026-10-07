import { useEffect, useRef } from "react";

export const RUN_AUTO_SYNC_INTERVAL_MS = 1_500;

export function useRunAutoSync(
  enabled: boolean,
  synchronize: () => Promise<boolean>,
  cancelInFlight: () => void,
) {
  const synchronizeRef = useRef(synchronize);
  const cancelRef = useRef(cancelInFlight);

  useEffect(() => {
    synchronizeRef.current = synchronize;
    cancelRef.current = cancelInFlight;
  }, [synchronize, cancelInFlight]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      if (cancelled) return;
      await synchronizeRef.current();
      if (!cancelled) {
        timer = setTimeout(tick, RUN_AUTO_SYNC_INTERVAL_MS);
      }
    }

    void tick();

    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
      // Timer cancellation is not enough: invalidate a network read that may
      // already be in flight so it cannot publish staged state after disable.
      cancelRef.current();
    };
  }, [enabled]);
}
