const KEY = "zellige-mvp-session-v1";

export type SavedSession = {
  token: string;
  conversationId: string;
  branchId: string;
  cursor: number;
};

const empty: SavedSession = { token: "", conversationId: "", branchId: "", cursor: 0 };

export function loadSession(): SavedSession {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return { ...empty };
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return { ...empty };
    const record = value as Record<string, unknown>;
    return {
      token: typeof record.token === "string" ? record.token : "",
      conversationId: typeof record.conversationId === "string" ? record.conversationId : "",
      branchId: typeof record.branchId === "string" ? record.branchId : "",
      cursor: typeof record.cursor === "number" && Number.isSafeInteger(record.cursor) && record.cursor >= 0 ? record.cursor : 0,
    };
  } catch {
    return { ...empty };
  }
}

export function saveSession(value: SavedSession): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // The app remains usable in memory when browser storage is unavailable.
  }
}
