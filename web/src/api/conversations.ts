import type { Client } from "./client";
import type { Branch, History, Item } from "./types";

export function createConversation(client: Client, title: string) {
  return client.request<{ conversation: { id: string; title: string }; branch: Branch }>(
    "/v1/conversations",
    { method: "POST", body: JSON.stringify({ title }) },
  );
}

export function getHistory(client: Client, conversationId: string, branchId: string) {
  return client.request<History>(
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
  return client.request<Item>(
    `/v1/conversations/${encodeURIComponent(conversationId)}/branches/${encodeURIComponent(branchId)}/items`,
    {
      method: "POST",
      body: JSON.stringify({
        expected_head_item_id: expectedHeadItemId,
        kind: "message",
        payload: { type: "message", role: "user", content: [{ type: "text", text }] },
      }),
    },
  );
}
