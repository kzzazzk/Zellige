import { vi } from "vitest";
import type { Branch, Conversation, Item, Profile, Run } from "../api/types";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const error = (code: string, message: string, status: number) =>
  json({ error: { code, message } }, status);

type RequestMatcher = (path: string, method: string) => boolean;
type NextRequest = {
  matches: RequestMatcher;
  respond: () => Response | Promise<void>;
};

function matchRequest(
  matcher: RequestMatcher | string,
  path?: string,
): RequestMatcher {
  return typeof matcher === "function"
    ? matcher
    : (requestPath, method) => method === matcher && requestPath === path;
}

export function apiFixture() {
  const conversations: Conversation[] = [];
  const branches: Branch[] = [];
  const items: Item[] = [];
  const profiles: Profile[] = [];
  const runs: Run[] = [];
  const runConversations = new Map<string, string>();
  const itemConversations = new Map<string, string>();
  const nextRequests: NextRequest[] = [];
  let conflict = false;
  const fetchMock = vi.fn(async (path: string, options?: RequestInit) => {
    if (new Headers(options?.headers).get("Authorization") !== "Bearer secret")
      return error("unauthorized", "a valid bearer token is required", 401);
    const method = options?.method ?? "GET";
    const nextIndex = nextRequests.findIndex(
      (entry) => entry.matches(path, method),
    );
    if (nextIndex !== -1) {
      const [next] = nextRequests.splice(nextIndex, 1);
      const response = await next.respond();
      if (response) return response;
    }
    const body = options?.body
      ? (JSON.parse(String(options.body)) as Record<string, unknown>)
      : {};
    const url = new URL(path, "http://localhost");
    const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (url.pathname === "/v1/conversations" && method === "GET") {
      const params = url.searchParams;
      const included = conversations.filter(
        (conversation) =>
          !!conversation.archived_at === (params.get("archived") === "true") &&
          conversation.title.toLowerCase().includes((params.get("query") ?? "").toLowerCase()),
      );
      const offset = Number(params.get("offset") ?? 0);
      const limit = Number(params.get("limit") ?? 50);
      return json({
        conversations: included.slice(offset, offset + limit),
        has_more: offset + limit < included.length,
      });
    }
    if (path === "/v1/conversations" && method === "POST") {
      const conversation: Conversation = {
        id: `conv-${conversations.length + 1}`,
        title: String(body.title),
        created_at: 1,
        updated_at: 1,
        deleted_at: null,
        archived_at: null,
      };
      const branch: Branch = {
        id: `branch-${branches.length + 1}`,
        conversation_id: conversation.id,
        name: "main",
        head_item_id: null,
        created_at: 1,
        updated_at: 1,
      };
      conversations.push(conversation);
      branches.push(branch);
      return json({ conversation, branch }, 201);
    }
    if (segments[1] === "conversations" && segments[2]) {
      const conversation = conversations.find((entry) => entry.id === segments[2]);
      if (!conversation) return error("not_found", "conversation not found", 404);
      if (segments.length === 3 && method === "GET") return json(conversation);
      if (segments.length === 3 && method === "PATCH") {
        if (body.expected_updated_at !== conversation.updated_at)
          return error("conversation_conflict", "conversation has changed", 409);
        if (body.title !== undefined) conversation.title = String(body.title);
        if (body.archived !== undefined) conversation.archived_at = body.archived ? 10 : null;
        conversation.updated_at++;
        return json(conversation);
      }
      if (segments[3] === "runs" && method === "GET")
        return json({ runs: runs.filter((run) => runConversations.get(run.id) === conversation.id) });
      if (segments[3] === "branches") {
        if (segments.length === 4 && method === "GET")
          return json({ branches: branches.filter((branch) => branch.conversation_id === conversation.id) });
        if (segments.length === 4 && method === "POST") {
          const head = body.head_item_id as string | null;
          if (head !== null && itemConversations.get(head) !== conversation.id)
            return error("invalid_branch", "invalid branch head", 400);
          const branch: Branch = {
            id: `branch-${branches.length + 1}`,
            conversation_id: conversation.id,
            name: String(body.name),
            head_item_id: head,
            created_at: 1,
            updated_at: 1,
          };
          branches.push(branch);
          return json(branch, 201);
        }
        const branch = branches.find(
          (entry) => entry.id === segments[4] && entry.conversation_id === conversation.id,
        );
        if (!branch) return error("not_found", "branch not found", 404);
        if (segments[5] === "history" && method === "GET") {
          const history: Item[] = [];
          let head = branch.head_item_id;
          while (head) {
            const item = items.find((entry) => entry.id === head)!;
            history.unshift(item);
            head = item.parent_item_id;
          }
          return json({ branch, items: history });
        }
        if (segments[5] === "items" && method === "POST") {
          if (conflict) {
            conflict = false;
            const external: Item = {
              id: `external-${items.length + 1}`,
              conversation_id: conversation.id,
              parent_item_id: branch.head_item_id,
              run_id: null,
              kind: "message",
              payload_schema_version: 1,
              payload: {
                type: "message",
                role: "user",
                content: [{ type: "text", text: "Desde otro dispositivo" }],
              },
              created_at: 2,
            };
            items.push(external);
            itemConversations.set(external.id, conversation.id);
            branch.head_item_id = external.id;
            conversation.updated_at++;
          }
          if (body.expected_head_item_id !== branch.head_item_id)
            return error("head_conflict", "branch head has changed", 409);
          const item: Item = {
            id: `item-${items.length + 1}`,
            conversation_id: conversation.id,
            parent_item_id: branch.head_item_id,
            run_id: null,
            kind: "message",
            payload_schema_version: 1,
            payload: body.payload as Item["payload"],
            created_at: 1,
          };
          items.push(item);
          itemConversations.set(item.id, conversation.id);
          branch.head_item_id = item.id;
          conversation.updated_at++;
          return json(item, 201);
        }
      }
    }
    if (path === "/v1/runtime-profiles" && method === "POST") {
      const profile: Profile = {
        runtime_profile: {
          id: `profile-${profiles.length + 1}`,
          name: String(body.name),
          description: null,
          created_at: 1,
        },
        version: {
          id: `profilev-${profiles.length + 1}`,
          runtime_profile_id: `profile-${profiles.length + 1}`,
          version: 1,
          definition: body.definition as Profile["version"]["definition"],
          created_at: 1,
        },
      };
      profiles.push(profile);
      return json(profile, 201);
    }
    if (path === "/v1/runtime-profiles" && method === "GET") return json({ profiles });
    if (path === "/v1/runs" && method === "POST") {
      const branch = branches.find(
        (entry) => entry.id === body.branch_id && entry.conversation_id === body.conversation_id,
      );
      if (!branch) return error("not_found", "branch not found", 404);
      const run: Run = {
        id: `run-${runs.length + 1}`,
        conversation_id: branch.conversation_id,
        branch_id: branch.id,
        status: "queued",
        input_head_item_id: branch.head_item_id,
        runtime_profile_version_id: String(body.runtime_profile_version_id),
        provider_session_id: null,
        request: {},
        result: null,
        context_pack_version_ids: [],
        created_at: 1,
        started_at: null,
        completed_at: null,
      };
      runs.push(run);
      runConversations.set(run.id, branch.conversation_id);
      return json(run, 201);
    }
    if (path.startsWith("/v1/changes") && method === "GET")
      return json({ changes: [], next_cursor: 4, has_more: false });
    throw new Error(`Unexpected request: ${method} ${path}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    fetchMock,
    conversations,
    profiles,
    items,
    branches,
    runs,
    conflictNext: () => {
      conflict = true;
    },
    failNext: (matcher: RequestMatcher | string, path?: string, code = "internal", status = 500) => {
      nextRequests.push({ matches: matchRequest(matcher, path), respond: () => error(code, "Injected failure", status) });
    },
    // Delay a matching request before it reads or mutates fixture state.
    deferNext: (matcher: RequestMatcher | string, path?: string) => {
      let release!: () => void;
      let started!: () => void;
      const pending = new Promise<void>((resolve) => { release = resolve; });
      const requested = new Promise<void>((resolve) => { started = resolve; });
      nextRequests.push({ matches: matchRequest(matcher, path), respond: () => { started(); return pending; } });
      return Object.assign(release, { requested, release });
    },
  };
}
