import type { Client } from "./client";
import type { Profile, Run } from "./types";

export function listProfiles(client: Client) {
  return client.request<{ profiles: Profile[] }>("/v1/runtime-profiles");
}

export function listRuns(client: Client, conversationId: string) {
  return client.request<{ runs: Run[] }>(
    `/v1/conversations/${encodeURIComponent(conversationId)}/runs`,
  );
}

export function createProfile(client: Client, name: string, mode = "general") {
  return client.request<Profile>("/v1/runtime-profiles", {
    method: "POST",
    body: JSON.stringify({ name, definition: { mode } }),
  });
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
