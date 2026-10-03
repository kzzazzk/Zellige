import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  Copy,
  GitBranch,
  Pencil,
  Play,
  X,
} from "lucide-react";
import type { Item } from "../api/types";
import type { Workspace } from "../features/useWorkspace";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { NativeSelect, NativeSelectOption } from "./ui/native-select";
import { BrandCompanion, BrandGreeting } from "./Brand";
import { cn } from "../lib/utils";

export function messageText(item: Item): string {
  if (!Array.isArray(item.payload.content))
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

function Message({
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

const SUGGESTIONS = [
  "Planifica un viaje de dos días",
  "Resume una idea en tres puntos",
  "Compara dos enfoques para un proyecto",
];

export function Chat({
  workspace: w,
  onSettings,
  onFork,
  onDetails,
}: {
  workspace: Workspace;
  onSettings: () => void;
  onFork: (head: string | null) => void;
  onDetails: () => void;
}) {
  const { draft, setDraft } = w;
  const [editing, setEditing] = useState<Item | null>(null);
  const [editConversationId, setEditConversationId] = useState("");
  const [editText, setEditText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const count = w.thread?.items.length ?? 0;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [count, w.thread?.branch.id]);
  async function send() {
    if (draft.trim()) await w.sendMessage(draft);
  }
  async function saveEdit() {
    if (
      editing &&
      editConversationId === w.thread?.conversation.id &&
      editText.trim() &&
      (await w.fork(
        `Edición ${new Date().toISOString()}`,
        editing.parent_item_id,
        editText.trim(),
      ))
    )
      setEditing(null);
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-8"
        aria-label="Historial"
        tabIndex={0}
      >
        <div className="mx-auto max-w-3xl">
          {count === 0 ? (
            <div className="flex min-h-[55vh] flex-col items-center justify-center py-10 text-center">
              <BrandGreeting className="mb-6 sm:mb-8" />
              <p className="eyebrow">
                {w.connected ? "Tu espacio para pensar" : "Sin conectar"}
              </p>
              <h1 className="mt-3 text-3xl font-medium tracking-[-0.04em]">
                {w.connected ? "Empieza una " : "Tu espacio para "}
                <em className="font-serif text-[1.2em] font-normal text-brand-detail">
                  {w.connected ? "conversación" : "conversar"}
                </em>
              </h1>
              <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
                {w.connected
                  ? "Guarda tus ideas y explora distintas ramas. El historial sigue siendo el mismo al cambiar de perfil."
                  : "Conecta con tu servidor Zellige para recuperar tus conversaciones desde este dispositivo."}
              </p>
              {w.connected ? (
                <div className="mt-7 flex max-w-xl flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      disabled={w.busy}
                      className="rounded-full border bg-popover/60 px-3.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:border-seam hover:text-foreground disabled:opacity-50"
                      onClick={() => {
                        setDraft(suggestion);
                        composer.current?.focus();
                      }}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-6">
                  <Button size="lg" onClick={onSettings}>
                    Conectar servidor
                  </Button>
                </div>
              )}
            </div>
          ) : (
            w.thread?.items.map((item) => (
              <Message
                key={item.id}
                item={item}
                busy={w.busy}
                onFork={(entry) => onFork(entry.id)}
                onEdit={(entry) => {
                  setEditing(entry);
                  setEditText(messageText(entry));
                  setEditConversationId(w.thread!.conversation.id);
                }}
              />
            ))
          )}
          <div ref={bottom} />
        </div>
      </div>
      <div className="shrink-0 px-4 pt-3 pb-4 sm:px-8 sm:pb-6">
        <div className="mx-auto max-w-3xl">
          {editing && editConversationId === w.thread?.conversation.id ? (
            <div className="mb-3 space-y-2 rounded-lg border bg-muted p-3">
              <div className="flex items-center justify-between text-xs">
                <span>
                  Editar crea una nueva rama. El original se conserva.
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Cancelar edición"
                  onClick={() => setEditing(null)}
                >
                  <X />
                </Button>
              </div>
              <Textarea
                aria-label="Texto editado"
                rows={3}
                value={editText}
                onChange={(event) => setEditText(event.target.value)}
                disabled={w.busy}
              />
              <Button
                disabled={w.busy || !editText.trim()}
                onClick={() => void saveEdit()}
              >
                Guardar en nueva rama
              </Button>
            </div>
          ) : null}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
            className="rounded-2xl border bg-popover p-2 shadow-[0_18px_40px_-28px_rgb(0_0_0/0.55)] transition-colors focus-within:border-seam"
          >
            <Textarea
              ref={composer}
              aria-label="Mensaje"
              placeholder={
                w.connected
                  ? "Escribe un mensaje…"
                  : "Conecta tu servidor para empezar"
              }
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={!w.connected || w.busy}
              rows={3}
              className="max-h-52 resize-none border-0 bg-transparent p-2 text-[15px] shadow-none focus-visible:ring-0 md:text-[15px] dark:bg-transparent"
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <div className="flex items-center justify-between gap-2 border-t border-seam-soft px-1 pt-2">
              <NativeSelect
                aria-label="Perfil de ejecución"
                value={w.profileId}
                onChange={(event) => w.setProfileId(event.target.value)}
                disabled={!w.connected || w.busy}
                className="max-w-[55%]"
              >
                <NativeSelectOption value="">Sin perfil</NativeSelectOption>
                {w.profiles.map((profile) => (
                  <NativeSelectOption
                    key={profile.version.id}
                    value={profile.version.id}
                  >
                    {profile.runtime_profile.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <div className="flex items-center gap-2">
                {w.profileId && (
                  <Button
                    type="button"
                    variant="ghost"
                    title="Crear ejecución en cola"
                    disabled={w.busy || !w.thread}
                    onClick={() => void w.queueRun()}
                  >
                    <Play /> Encolar
                  </Button>
                )}
                <Button
                  type="submit"
                  size="icon-lg"
                  aria-label="Guardar mensaje"
                  disabled={!w.connected || w.busy || !draft.trim()}
                >
                  <ArrowUp />
                </Button>
              </div>
            </div>
          </form>
          {w.queuedNotice && (
            <div
              role="status"
              className="mt-2 flex flex-wrap items-center justify-center gap-x-2 text-xs text-muted-foreground"
            >
              <span>En cola. Todavía no se ha generado una respuesta.</span>
              <button
                type="button"
                className="underline underline-offset-4"
                onClick={onDetails}
              >
                Ver detalles
              </button>
            </div>
          )}
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Los mensajes se guardan en tu servidor. Los agentes todavía no están
            conectados.
            <span className="hidden sm:inline">
              {" "}
              · Enter guarda, Mayús + Enter añade una línea.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
