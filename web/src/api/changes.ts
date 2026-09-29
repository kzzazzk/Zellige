import type { Client } from "./client";
import type { Changes } from "./types";

export function getChanges(client: Client, cursor: number) {
  return client.request<Changes>(`/v1/changes?cursor=${cursor}&limit=100`);
}
