import { useState, type FormEvent } from "react";
import type { Item } from "../api/types";
import { MessageList } from "./MessageList";

type Props = {
  conversationId: string; branchId: string; headItemId: string | null; items: Item[]; busy: boolean;
  onCreate: (title: string) => Promise<void>;
  onOpen: (conversationId: string, branchId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onSend: (text: string) => Promise<boolean>;
};

const inputClass = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400";
const buttonClass = "rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:hover:bg-emerald-800";

export function ConversationPanel(props: Props) {
  const [title, setTitle] = useState("");
  const [existingConversationId, setExistingConversationId] = useState("");
  const [existingBranchId, setExistingBranchId] = useState("");
  const [draft, setDraft] = useState("");

  function create(event: FormEvent) { event.preventDefault(); void props.onCreate(title); }
  function open(event: FormEvent) { event.preventDefault(); void props.onOpen(existingConversationId, existingBranchId); }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (await props.onSend(draft)) setDraft("");
  }

  return (
    <section className="space-y-5" aria-labelledby="conversation-heading">
      <div>
        <h2 id="conversation-heading" className="text-xl font-semibold tracking-tight">Conversación</h2>
        <p className="text-sm text-stone-600">Historial canónico. Aquí todavía no responde ningún agente.</p>
      </div>
      <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="title">Título</label>
        <input id="title" className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Título de la nueva conversación" />
        <button className={buttonClass + " shrink-0"} disabled={props.busy}>Crear conversación</button>
      </form>
      <details className="rounded-lg border border-stone-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-medium">Abrir conversación existente por ID</summary>
        <form onSubmit={open} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <label className="sr-only" htmlFor="existing-conversation">ID de conversación</label>
          <input id="existing-conversation" className={inputClass} value={existingConversationId} onChange={(event) => setExistingConversationId(event.target.value)} placeholder="conversation_id" />
          <label className="sr-only" htmlFor="existing-branch">ID de rama</label>
          <input id="existing-branch" className={inputClass} value={existingBranchId} onChange={(event) => setExistingBranchId(event.target.value)} placeholder="branch_id" />
          <button className={buttonClass} disabled={props.busy}>Abrir</button>
        </form>
      </details>
      <div className="rounded-xl border border-stone-200 bg-stone-100 p-3 text-xs text-stone-600">
        <div>Conversación: <code className="break-all text-stone-900">{props.conversationId || "—"}</code></div>
        <div>Rama: <code className="break-all text-stone-900">{props.branchId || "—"}</code></div>
        <div>Cabeza: <code className="break-all text-stone-900">{props.headItemId || "null"}</code></div>
      </div>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Historial</h3>
        <button type="button" className="text-sm font-medium text-emerald-800 underline disabled:no-underline" onClick={() => void props.onRefresh()} disabled={props.busy || !props.conversationId}>Actualizar</button>
      </div>
      <MessageList items={props.items} />
      <form onSubmit={(event) => void send(event)} className="space-y-2">
        <label className="text-sm font-medium" htmlFor="message">Nuevo mensaje de usuario</label>
        <textarea id="message" className={inputClass} rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Escribe un mensaje…" />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-stone-500">Si hay conflicto 409, conservamos este borrador.</span>
          <button className={buttonClass} disabled={props.busy || !props.conversationId || !draft.trim()}>Añadir mensaje</button>
        </div>
      </form>
    </section>
  );
}
