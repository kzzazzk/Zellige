import type { Item } from "../../api/types";

export function messageText(item: Item): string {
  if (!("content" in item.payload) || !Array.isArray(item.payload.content))
    return JSON.stringify(item.payload, null, 2);
  return item.payload.content
    .map((block: unknown) => {
      const value = block as Record<string, unknown>;
      return value.type === "text"
        ? String(value.text)
        : `[${String(value.type)}: ${String(value.artifact_id ?? "adjunto")}]`;
    })
    .join("\n");
}

