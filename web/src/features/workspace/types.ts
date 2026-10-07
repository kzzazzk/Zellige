import type { Branch, Conversation, Item, Run } from "../../api/types";

export type Thread = {
  conversation: Conversation;
  branches: Branch[];
  branch: Branch;
  items: Item[];
  runs: Run[];
};

export type Failure = {
  message: string;
  status: number | null;
  code: string | null;
  details: unknown;
};
