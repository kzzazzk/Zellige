import { useState } from "react";
import { Check, Copy, GitBranch, Pencil } from "lucide-react";
import type { Item } from "../../api/types";
import { Button } from "../ui/button";
import { BrandCompanion } from "../Brand";
import { cn } from "../../lib/utils";
import { messageText } from "./messageText";

export function Message({
  item,
  busy,
  onEdit,
  onFork,
}: {
  item: Item;
  busy: boolean;
  onEdit: (item: Item) => void;
  onFork: (item: Item) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const text = messageText(item);
  const user = item.kind === "message" && item.payload.role === "user";
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }
  return (
    <article className="group relative py-3.5 pl-9">
      {/* The history reads as a seam of pieces, like the branch diagram on the landing. */}
      <span aria-hidden="true" className="absolute inset-y-0 left-[11px] w-px bg-seam-soft" />
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-[22px] left-[7px] size-[9px] rotate-45 border border-seam",
          user ? "bg-background" : "bg-seam",
        )}
      />
      <div className="mb-1.5 flex items-center gap-2 text-xs font-medium">
        {!user && <BrandCompanion alt="" className="size-5 sm:size-5" />}
        <span className={cn(!user && "text-brand-detail")}>
          {user
            ? "Tú"
            : item.payload.role === "assistant"
              ? "Asistente"
              : item.kind}
        </span>
        <time className="font-normal text-muted-foreground">
          {new Date(item.created_at / 1000).toLocaleTimeString("es", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      </div>
      <div>
        {item.kind === "message" ? (
          <p
            className={cn(
              "whitespace-pre-wrap wrap-anywhere text-[15px] leading-7",
              user &&
                "w-fit max-w-full rounded-xl rounded-tl-sm bg-user-bubble px-4 py-2.5",
            )}
          >
            {text}
          </p>
        ) : (
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Ver {item.kind}
            </summary>
            <pre className="mt-2 overflow-x-auto text-xs">
              {JSON.stringify(item.payload, null, 2)}
            </pre>
          </details>
        )}
        <div className="mt-1.5 -ml-1.5 flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Copiar mensaje"
            title={copied ? "Copiado" : "Copiar"}
            onClick={() => void copy()}
          >
            {copied ? <Check /> : <Copy />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Crear rama desde este mensaje"
            title="Crear rama"
            disabled={busy}
            onClick={() => onFork(item)}
          >
            <GitBranch />
          </Button>
          {user && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Editar en una nueva rama"
              title="Editar en una nueva rama"
              disabled={busy}
              onClick={() => onEdit(item)}
            >
              <Pencil />
            </Button>
          )}
        </div>
        {copyError && (
          <p role="status" className="text-xs text-muted-foreground">
            No se pudo copiar. Selecciona el texto y cópialo manualmente.
          </p>
        )}
      </div>
    </article>
  );
}

