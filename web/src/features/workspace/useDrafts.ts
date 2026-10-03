import { useState } from "react";

export function useDrafts(key: string) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  function setDraft(value: string) {
    setDrafts((current) => ({ ...current, [key]: value }));
  }
  function transfer(from: string, to: string, value: string) {
    setDrafts((current) => ({ ...current, [from]: "", [to]: value }));
  }
  function clear(target: string) {
    setDrafts((current) => ({ ...current, [target]: "" }));
  }
  function reset() { setDrafts({}); }
  return { draft: drafts[key] ?? "", setDraft, transfer, clear, reset };
}
