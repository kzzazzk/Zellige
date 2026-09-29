import type { Client } from "./client";
import type { Run } from "./types";

export function createProfile(client: Client, name: string) {
  return client.request<{ runtime_profile: { id: string }; version: { id: string; version: number } }>(
    "/v1/runtime-profiles",
    { method: "POST", body: JSON.stringify({ name, definition: { mode: "manual-mvp" } }) },
  );
}

export function createRun(
  client: Client,
  conversationId: string,
  branchId: string,
  profileVersionId: string,
) {
  return client.request<Run>("/v1/runs", {
    method: "POST",
    body: JSON.stringify({
      conversation_id: conversationId,
      branch_id: branchId,
      runtime_profile_version_id: profileVersionId,
      request: {},
    }),
  });
}
