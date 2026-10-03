import type { Client } from "./client";
import type { RequestBody, ResponseBody } from "./types";

export function listProfiles(client: Client) {
  return client.request<ResponseBody<"listRuntimeProfiles">>("/v1/runtime-profiles");
}

export function listRuns(client: Client, conversationId: string) {
  return client.request<ResponseBody<"listConversationRuns">>(
    `/v1/conversations/${encodeURIComponent(conversationId)}/runs`,
  );
}

export function createProfile(client: Client, name: string, mode = "general") {
  const body = { name, definition: { mode } } satisfies RequestBody<"createRuntimeProfile">;
  return client.request<ResponseBody<"createRuntimeProfile">>("/v1/runtime-profiles", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createRun(
  client: Client,
  conversationId: string,
  branchId: string,
  profileVersionId: string,
) {
  const body = {
    conversation_id: conversationId,
    branch_id: branchId,
    runtime_profile_version_id: profileVersionId,
    request: {},
  } satisfies RequestBody<"createRun">;
  return client.request<ResponseBody<"createRun">>("/v1/runs", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
