import type { Item } from "../api/types";

function itemText(item: Item): string {
  if (item.kind !== "message" || !Array.isArray(item.payload.content)) return JSON.stringify(item.payload);
  return item.payload.content
    .map((block: unknown) => {
      if (!block || typeof block !== "object") return "";
      const value = block as Record<string, unknown>;
      return value.type === "text" && typeof value.text === "string" ? value.text : `[${String(value.type ?? "contenido")}]`;
    })
    .filter(Boolean)
    .join("\n");
}

export function MessageList({ items }: { items: Item[] }) {
  return (
    <div className="min-h-64 space-y-3 overflow-y-auto rounded-xl border border-stone-200 bg-white p-4" aria-label="Historial">
      {items.length === 0 ? <p className="text-sm text-stone-500">Sin mensajes en esta rama.</p> : null}
      {items.map((item) => {
        const role = typeof item.payload.role === "string" ? item.payload.role : item.kind;
        return (
          <article key={item.id} className="rounded-lg border border-stone-200 bg-stone-50 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
              <span className="font-semibold uppercase tracking-wide text-emerald-800">{role}</span>
              <code className="break-all">{item.id}</code>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm text-stone-900">{itemText(item)}</p>
          </article>
        );
      })}
    </div>
  );
}
