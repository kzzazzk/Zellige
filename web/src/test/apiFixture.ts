import { vi } from "vitest";
import type { Branch, Conversation, Item, Profile, Run } from "../api/types";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export function apiFixture() {
  let conversation: Conversation | null = null;
  const branches: Branch[] = [];
  const items: Item[] = [];
  const profiles: Profile[] = [];
  const runs: Run[] = [];
  let conflict = false;
  const fetchMock = vi.fn(async (path: string, options?: RequestInit) => {
    if (new Headers(options?.headers).get("Authorization") !== "Bearer secret")
      return json(
        {
          error: {
            code: "unauthorized",
            message: "a valid bearer token is required",
          },
        },
        401,
      );
    const body = options?.body
      ? (JSON.parse(String(options.body)) as Record<string, unknown>)
      : {};
    const method = options?.method ?? "GET";
    if (path.startsWith("/v1/conversations?") && method === "GET") {
      const params = new URL(path, "http://localhost").searchParams;
      const included =
        conversation &&
        !!conversation.archived_at === (params.get("archived") === "true") &&
        conversation.title
          .toLowerCase()
          .includes((params.get("query") ?? "").toLowerCase());
      return json({
        conversations: included ? [conversation] : [],
        has_more: false,
      });
    }
    if (path === "/v1/conversations" && method === "POST") {
      conversation = {
        id: "conv-1",
        title: String(body.title),
        created_at: 1,
        updated_at: 1,
        deleted_at: null,
        archived_at: null,
      };
      branches.push({
        id: "branch-1",
        conversation_id: "conv-1",
        name: "main",
        head_item_id: null,
      });
      return json({ conversation, branch: branches[0] }, 201);
    }
    if (
      path === "/v1/conversations/conv-1" &&
      method === "PATCH" &&
      conversation
    ) {
      conversation = {
        ...conversation,
        title:
          body.title === undefined ? conversation.title : String(body.title),
        archived_at:
          body.archived === undefined
            ? conversation.archived_at
            : body.archived
              ? 10
              : null,
        updated_at: conversation.updated_at + 1,
      };
      return json(conversation);
    }
    if (path === "/v1/conversations/conv-1") return json(conversation);
    if (path.endsWith("/branches") && method === "GET")
      return json({ branches });
    if (path.endsWith("/branches") && method === "POST") {
      const branch = {
        id: `branch-${branches.length + 1}`,
        conversation_id: "conv-1",
        name: String(body.name),
        head_item_id: body.head_item_id as string | null,
      };
      branches.push(branch);
      return json(branch, 201);
    }
    if (path.endsWith("/history")) {
      const branch = branches.find((entry) => path.includes(entry.id))!;
      const history: Item[] = [];
      let head = branch.head_item_id;
      while (head) {
        const item = items.find((entry) => entry.id === head)!;
        history.unshift(item);
        head = item.parent_item_id;
      }
      return json({ branch, items: history });
    }
    if (path.endsWith("/items")) {
      const branch = branches.find((entry) => path.includes(entry.id))!;
      if (conflict) {
        conflict = false;
        const external: Item = {
          id: "external",
          parent_item_id: branch.head_item_id,
          kind: "message",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "text", text: "Desde otro dispositivo" }],
          },
          created_at: 2,
        };
        items.push(external);
        branch.head_item_id = external.id;
        return json(
          {
            error: {
              code: "head_conflict",
              message: "branch head has changed",
            },
          },
          409,
        );
      }
      const item: Item = {
        id: `item-${items.length + 1}`,
        parent_item_id: body.expected_head_item_id as string | null,
        kind: "message",
        payload: body.payload as Record<string, unknown>,
        created_at: 1,
      };
      items.push(item);
      branch.head_item_id = item.id;
      if (conversation) conversation.updated_at++;
      return json(item, 201);
    }
    if (path === "/v1/runtime-profiles" && method === "POST") {
      const profile: Profile = {
        runtime_profile: {
          id: "profile-1",
          name: String(body.name),
          description: null,
        },
        version: { id: "profilev-1", version: 1, definition: {} },
      };
      profiles.push(profile);
      return json(profile, 201);
    }
    if (path === "/v1/runtime-profiles") return json({ profiles });
    if (path === "/v1/runs") {
      const run: Run = {
        id: "run-1",
        status: "queued",
        input_head_item_id: branches[0].head_item_id,
        runtime_profile_version_id: String(body.runtime_profile_version_id),
        created_at: 1,
      };
      runs.push(run);
      return json(run, 201);
    }
    if (path.endsWith("/runs")) return json({ runs });
    if (path.startsWith("/v1/changes"))
      return json({ changes: [], next_cursor: 4, has_more: false });
    throw new Error(`Unexpected request: ${method} ${path}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    fetchMock,
    items,
    branches,
    runs,
    conflictNext: () => {
      conflict = true;
    },
  };
}
