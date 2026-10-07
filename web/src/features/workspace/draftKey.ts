import type { Thread } from "./types";

export function draftKey(
  thread: Pick<Thread, "conversation" | "branch"> | null,
): string {
  return thread
    ? JSON.stringify([thread.conversation.id, thread.branch.id])
    : "new";
}
