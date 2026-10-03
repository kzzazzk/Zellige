import { useState } from "react";
import type { ConversationPage } from "../../api/types";
import type { Thread } from "./types";

export function useConversationState() {
  const [page, setPage] = useState<ConversationPage>({
    conversations: [],
    has_more: false,
  });
  const [archived, setArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [thread, setThread] = useState<Thread | null>(null);
  return { page, setPage, archived, setArchived, query, setQuery, thread, setThread };
}
