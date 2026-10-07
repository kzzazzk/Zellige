import type { Client } from "./client";
import type { Conversation, QueryParameters, RequestBody, ResponseBody } from "./types";

export function listConversations(
  client: Client,
  archived = false,
  query = "",
  offset = 0,
) {
  const queryParams = { archived, query, offset, limit: 50 } satisfies QueryParameters<"listConversations">;
  const params = new URLSearchParams(
    Object.entries(queryParams).map(([key, value]) => [key, String(value)]),
  );
  return client.request<ResponseBody<"listConversations">>(`/v1/conversations?${params}`);
}

export function getConversation(client: Client, id: string) {
  return client.request<ResponseBody<"getConversation">>(
    `/v1/conversations/${encodeURIComponent(id)}`,
  );
}

export function updateConversation(
  client: Client,
  conversation: Conversation,
  change: Pick<RequestBody<"updateConversation">, "title" | "archived">,
) {
  const body = {
    ...change,
    expected_updated_at: conversation.updated_at,
  } satisfies RequestBody<"updateConversation">;
  return client.request<ResponseBody<"updateConversation">>(
    `/v1/conversations/${encodeURIComponent(conversation.id)}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
}

export function listBranches(client: Client, id: string) {
  return client.request<ResponseBody<"listBranches">>(
    `/v1/conversations/${encodeURIComponent(id)}/branches`,
  );
}

export function createBranch(
  client: Client,
  id: string,
  name: string,
  head: string | null,
) {
  const body = { name, head_item_id: head } satisfies RequestBody<"createBranch">;
  return client.request<ResponseBody<"createBranch">>(
    `/v1/conversations/${encodeURIComponent(id)}/branches`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function createConversation(client: Client, title: string) {
  const body = { title } satisfies RequestBody<"createConversation">;
  return client.request<ResponseBody<"createConversation">>(
    "/v1/conversations",
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function getHistory(
  client: Client,
  conversationId: string,
  branchId: string,
) {
  return client.request<ResponseBody<"getBranchHistory">>(
    `/v1/conversations/${encodeURIComponent(conversationId)}/branches/${encodeURIComponent(branchId)}/history`,
  );
}

export function appendMessage(
  client: Client,
  conversationId: string,
  branchId: string,
  expectedHeadItemId: string | null,
  text: string,
) {
  const body = {
    expected_head_item_id: expectedHeadItemId,
    kind: "message",
    payload: {
      type: "message",
      role: "user",
      content: [{ type: "text", text }],
    },
  } satisfies RequestBody<"appendItem">;
  return client.request<ResponseBody<"appendItem">>(
    `/v1/conversations/${encodeURIComponent(conversationId)}/branches/${encodeURIComponent(branchId)}/items`,
    { method: "POST", body: JSON.stringify(body) },
  );
}
