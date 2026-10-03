import type { Client } from "./client";
import type {
  Branch,
  Conversation,
  ConversationPage,
  History,
  Item,
} from "./types";

export function listConversations(
  client: Client,
  archived = false,
  query = "",
  offset = 0,
) {
  const params = new URLSearchParams({
    archived: String(archived),
    query,
    offset: String(offset),
    limit: "50",
  });
  return client.request<ConversationPage>(`/v1/conversations?${params}`);
}

export function getConversation(client: Client, id: string) {
  return client.request<Conversation>(
    `/v1/conversations/${encodeURIComponent(id)}`,
  );
}

export function updateConversation(
  client: Client,
  conversation: Conversation,
  change: { title?: string; archived?: boolean },
) {
  return client.request<Conversation>(
    `/v1/conversations/${encodeURIComponent(conversation.id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        ...change,
        expected_updated_at: conversation.updated_at,
      }),
    },
  );
}

export function listBranches(client: Client, id: string) {
  return client.request<{ branches: Branch[] }>(
    `/v1/conversations/${encodeURIComponent(id)}/branches`,
  );
}

export function createBranch(
  client: Client,
  id: string,
  name: string,
  head: string | null,
) {
  return client.request<Branch>(
    `/v1/conversations/${encodeURIComponent(id)}/branches`,
    {
      method: "POST",
      body: JSON.stringify({ name, head_item_id: head }),
    },
  );
}

export function createConversation(client: Client, title: string) {
  return client.request<{ conversation: Conversation; branch: Branch }>(
    "/v1/conversations",
    { method: "POST", body: JSON.stringify({ title }) },
  );
}

export function getHistory(
  client: Client,
  conversationId: string,
  branchId: string,
) {
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
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "text", text }],
        },
      }),
    },
  );
}
