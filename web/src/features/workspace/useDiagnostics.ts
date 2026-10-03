import { useState } from "react";
import type { Client } from "../../api/client";
import { getChanges } from "../../api/changes";
import type { Change } from "../../api/types";
import type { Operation } from "./useWorkspaceOperation";

export function useDiagnostics(initialCursor: number) {
  const [cursor, setCursor] = useState(initialCursor);
  const [changes, setChanges] = useState<Change[]>([]);
  const [hasMoreChanges, setHasMoreChanges] = useState(false);
  function actions(client: Client, { perform, record }: Pick<Operation, "perform" | "record">) {
    function readChanges() {
      return perform(async () => {
        const result = record(await getChanges(client, cursor));
        setChanges(result.changes);
        setCursor(result.next_cursor);
        setHasMoreChanges(result.has_more);
      });
    }

    return { readChanges };
  }
  return { cursor, setCursor, changes, setChanges, hasMoreChanges, actions };
}
