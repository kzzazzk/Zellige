export type Branch = {
  id: string;
  conversation_id: string;
  name: string;
  head_item_id: string | null;
};

export type Item = {
  id: string;
  parent_item_id: string | null;
  kind: "message" | "tool_call" | "tool_result" | "activity" | "artifact";
  payload: Record<string, unknown>;
  created_at: number;
};

export type History = { branch: Branch; items: Item[] };

export type Run = {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  input_head_item_id: string | null;
  runtime_profile_version_id: string;
  context_pack_version_ids: string[];
  created_at: number;
};

export type Profile = {
  runtime_profile: { id: string; name: string; description: string | null };
  version: { id: string; version: number; definition: Record<string, unknown> };
};

export type Change = {
  seq: number;
  conversation_id: string | null;
  entity_type: string;
  entity_id: string;
  operation: "upsert" | "delete";
  data: Record<string, unknown>;
};

export type Changes = {
  changes: Change[];
  next_cursor: number;
  has_more: boolean;
};

export type ApiResult<T> = { status: number; data: T };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string | null = null,
    readonly details: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export type Conversation = {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  archived_at: number | null;
};

export type ConversationPage = {
  conversations: Conversation[];
  has_more: boolean;
};
