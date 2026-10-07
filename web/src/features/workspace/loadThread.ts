import type { Client } from "../../api/client";
import {
  getConversation,
  getHistory,
  listBranches,
} from "../../api/conversations";
import { listRuns } from "../../api/runs";
import { ApiError } from "../../api/types";
import type { Thread } from "./types";

export async function loadThread(
  client: Client,
  conversationId: string,
  branchId = "",
): Promise<Thread> {
  const [conversation, branches, runs] = await Promise.all([
    getConversation(client, conversationId),
    listBranches(client, conversationId),
    listRuns(client, conversationId),
  ]);
  const branch =
    branches.data.branches.find((entry) => entry.id === branchId) ??
    branches.data.branches[0];
  if (!branch) throw new ApiError("Esta conversación no tiene ramas.", 404);
  const history = await getHistory(client, conversationId, branch.id);
  return {
    conversation: conversation.data,
    branches: branches.data.branches,
    branch: history.data.branch,
    items: history.data.items,
    runs: runs.data.runs,
  };
}
