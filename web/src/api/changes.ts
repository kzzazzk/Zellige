import type { Client } from "./client";
import type { QueryParameters, ResponseBody } from "./types";

export function getChanges(client: Client, cursor: number) {
  const params = { cursor, limit: 100 } satisfies QueryParameters<"getChanges">;
  return client.request<ResponseBody<"getChanges">>(`/v1/changes?cursor=${params.cursor}&limit=${params.limit}`);
}
