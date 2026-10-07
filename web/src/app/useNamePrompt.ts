import { useState } from "react";
import type { Conversation } from "../api/types";


type NamePrompt =
  | { kind: "rename"; conversation: Conversation }
  | { kind: "branch"; head: string | null; conversationId: string | null };

type Actions = {
  conversationId: string | null;
  branchCount: number;
  changeConversation: (conversation: Conversation, change: { title?: string; archived?: boolean }) => Promise<boolean>;
  fork: (name: string, parent: string | null, editedText?: string) => Promise<boolean>;
};

export function useNamePrompt(w: Actions) {
  const [prompt, setPrompt] = useState<NamePrompt | null>(null);
  const [name, setName] = useState("");
  function rename(conversation: Conversation) {
    setPrompt({ kind: "rename", conversation });
    setName(conversation.title);
  }
  function fork(head: string | null) {
    setPrompt({ kind: "branch", head, conversationId: w.conversationId });
    setName(`Rama ${w.branchCount + 1}`);
  }
  async function submitName() {
    if (!prompt || !name.trim()) return;
    if (prompt.kind === "branch" && prompt.conversationId !== w.conversationId) {
      setPrompt(null);
      return;
    }
    const ok =
      prompt.kind === "rename"
        ? await w.changeConversation(prompt.conversation, {
            title: name.trim(),
          })
        : await w.fork(name, prompt.head);
    if (ok) setPrompt(null);
  }

  return {
    prompt,
    name,
    setName,
    rename,
    fork,
    submitName,
    close: () => setPrompt(null),
  };
}
