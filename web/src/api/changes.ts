import type { Client } from "./client";
import { ApiError, type ApiResult, type Change, type Changes, type QueryParameters, type ResponseBody } from "./types";

export function getChanges(client: Client, cursor: number) {
  const params = { cursor, limit: 100 } satisfies QueryParameters<"getChanges">;
  return client.request<ResponseBody<"getChanges">>(`/v1/changes?cursor=${params.cursor}&limit=${params.limit}`);
}

// Stop at the first observed drained page; concurrent writes may still continue.
export async function drainChanges(client: Client, startingCursor: number): Promise<ApiResult<Changes>> {
  const changes: Change[] = [];
  let cursor = startingCursor;
  while (true) {
    const result = await getChanges(client, cursor);
    const { next_cursor, has_more } = result.data;
    if (!Number.isFinite(next_cursor) || next_cursor < cursor || (has_more && next_cursor === cursor)) {
      throw new ApiError("El cursor de cambios no avanzó correctamente.", result.status);
    }
    changes.push(...result.data.changes);
    if (!has_more) {
      return { status: result.status, data: { changes, next_cursor, has_more: false } };
    }
    cursor = next_cursor;
  }
}

export type ChangeInvalidation = {
  conversations: boolean;
  thread: boolean;
  profiles: boolean;
};

// Changes invalidate authoritative reads; their generic data is never decoded.
export function classifyChanges(changes: readonly Change[], selectedConversationId: string | null): ChangeInvalidation {
  const intent: ChangeInvalidation = { conversations: false, thread: false, profiles: false };
  for (const change of changes) {
    const conversationId = change.conversation_id ?? (change.entity_type === "conversation" ? change.entity_id : null);
    if (conversationId !== null) {
      intent.conversations = true;
      if (selectedConversationId === conversationId) intent.thread = true;
    }
    if (change.entity_type === "runtime_profile" || change.entity_type === "runtime_profile_version") {
      intent.profiles = true;
    } else if (conversationId === null) {
      // Unknown/global entities may affect any frontend-owned canonical state.
      intent.conversations = true;
      intent.thread = selectedConversationId !== null;
      intent.profiles = true;
    } else if (!["conversation", "item", "branch", "run"].includes(change.entity_type)) {
      // A new scoped entity may also affect frontend-owned global resources.
      intent.profiles = true;
    }
  }
  return intent;
}
