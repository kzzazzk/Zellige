import type { ReactNode, Ref } from "react";
import type { Item } from "../../api/types";
import { Message } from "./Message";

export function ChatHistory({ items, busy, onFork, onEdit, bottomRef, emptyState }: {
  items: Item[];
  busy: boolean;
  onFork: (item: Item) => void;
  onEdit: (item: Item) => void;
  bottomRef: Ref<HTMLDivElement>;
  emptyState: ReactNode;
}) {
  return (
      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-8"
        aria-label="Historial"
        tabIndex={0}
      >
        <div className="mx-auto max-w-3xl">
          {items.length === 0 ? emptyState : items.map((item) => (
            <Message key={item.id} item={item} busy={busy} onFork={onFork} onEdit={onEdit} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
  );
}
