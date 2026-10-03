export const workspaceKeys = {
  all: ["workspace"] as const,
  conversations: (archived: boolean, query: string) =>
    ["workspace", "conversations", archived, query] as const,
  thread: (conversationId: string, branchId: string) =>
    ["workspace", "thread", conversationId, branchId] as const,
  profiles: ["workspace", "profiles"] as const,
};
