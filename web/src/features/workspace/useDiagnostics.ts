import { useState } from "react";
import type { Change } from "../../api/types";

export function useDiagnostics(initialCursor: number) {
  const [cursor, setCursor] = useState(initialCursor);
  const [changes, setChanges] = useState<Change[]>([]);
  const [hasMoreChanges, setHasMoreChanges] = useState(false);
  function reset() {
    setChanges([]);
    setHasMoreChanges(false);
    setCursor(0);
  }
  return { cursor, setCursor, changes, setChanges, hasMoreChanges, setHasMoreChanges, reset };
}
