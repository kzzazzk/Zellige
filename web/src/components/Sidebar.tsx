import { useState } from "react";
import {
  Archive,
  ArchiveRestore,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
} from "lucide-react";
import type { Conversation, ConversationPage } from "../api/types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { cn } from "../lib/utils";
import { BrandEmblem, BrandWordmark, StarGlyph } from "./Brand";

type Props = {
  page: ConversationPage;
  selectedId?: string;
  connected: boolean;
  busy: boolean;
  archived: boolean;
  query: string;
  refresh: () => Promise<boolean>;
  newChat: () => void;
  search: (value: string, showArchived?: boolean) => Promise<boolean>;
  selectConversation: (id: string, branchId?: string) => Promise<boolean>;
  changeConversation: (conversation: Conversation, change: { title?: string; archived?: boolean }) => Promise<boolean>;
  loadMore: () => Promise<boolean>;
  onSettings: () => void;
  onRename: (conversation: Conversation) => void;
  onNavigate: () => void;
};

export function Sidebar(w: Props) {
  const { onSettings, onRename, onNavigate } = w;
  const [search, setSearch] = useState("");
  return (
    <nav
      aria-label="Conversaciones"
      className="zellige-lattice flex h-full flex-col bg-sidebar [--lattice-opacity:0.07]"
    >
      <div className="flex h-14 shrink-0 items-center justify-between px-4">
        <span className="flex items-center gap-1.5">
          <BrandEmblem className={cn(w.busy && "animate-[spin_4s_linear_infinite]")} />
          <BrandWordmark className="h-8" />
        </span>
        <Button
          variant="ghost"
          size="icon"
          title="Actualizar"
          aria-label="Actualizar conversaciones"
          disabled={!w.connected || w.busy}
          onClick={() => void w.refresh()}
        >
          <RefreshCw />
        </Button>
      </div>
      <div className="space-y-3 px-3 pb-4">
        <Button
          variant="outline"
          size="lg"
          className="w-full justify-start"
          disabled={!w.connected || w.busy}
          onClick={() => {
            w.newChat();
            onNavigate();
          }}
        >
          <Plus /> Nueva conversación
        </Button>
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            void w.search(search);
          }}
          className="relative"
        >
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar conversaciones"
            placeholder="Buscar y pulsar Enter…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-8"
            disabled={!w.connected || w.busy}
          />
        </form>
      </div>
      <div className="flex items-center gap-3 px-4 pb-2 text-muted-foreground">
        <span className="eyebrow">{w.archived ? "Archivadas" : "Conversaciones"}</span>
        <span aria-hidden="true" className="h-px flex-1 bg-seam-soft" />
        <span className="text-[11px] tabular-nums">
          {w.page.conversations.length}
          {w.page.has_more ? "+" : ""}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {w.page.conversations.map((conversation) => (
          <div
            key={conversation.id}
            className={cn(
              "group relative mb-0.5 flex items-center rounded-md transition-colors",
              w.selectedId === conversation.id
                ? "bg-accent text-accent-foreground before:absolute before:inset-y-2 before:-left-2 before:w-0.5 before:rounded-full before:bg-seam"
                : "hover:bg-muted",
            )}
          >
            <button
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-2.5 text-left text-[13px] disabled:opacity-50"
              disabled={w.busy}
              aria-current={
                w.selectedId === conversation.id
                  ? "page"
                  : undefined
              }
              onClick={() => {
                void w.selectConversation(conversation.id);
                onNavigate();
              }}
            >
              <StarGlyph
                filled={w.selectedId === conversation.id}
                className={cn(
                  "size-3.5",
                  w.selectedId === conversation.id
                    ? "text-brand-detail"
                    : "text-muted-foreground",
                )}
              />
              <span className="truncate">{conversation.title}</span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Opciones de ${conversation.title}`}
                    disabled={w.busy}
                  />
                }
                className="mr-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onRename(conversation)}>
                  <Pencil /> Renombrar
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    void w.changeConversation(conversation, {
                      archived: !conversation.archived_at,
                    })
                  }
                >
                  {conversation.archived_at ? <ArchiveRestore /> : <Archive />}
                  {conversation.archived_at ? "Restaurar" : "Archivar"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
        {!w.busy && w.page.conversations.length === 0 && (
          <p className="px-2 py-5 text-xs leading-relaxed text-muted-foreground">
            {!w.connected
              ? "Conecta tu servidor para acceder a tus conversaciones."
              : w.query
                ? "No hay conversaciones con ese título."
                : w.archived
                  ? "No tienes conversaciones archivadas."
                  : "Tu primera conversación aparecerá aquí."}
          </p>
        )}
        {w.page.has_more && (
          <Button
            variant="ghost"
            className="my-2 w-full"
            disabled={w.busy}
            onClick={() => void w.loadMore()}
          >
            Cargar más
          </Button>
        )}
      </div>
      <div className="space-y-1 border-t border-seam-soft p-2">
        <Button
          variant="ghost"
          className="w-full justify-start"
          disabled={!w.connected || w.busy}
          onClick={() => void w.search(w.query, !w.archived)}
        >
          <Archive />
          {w.archived ? "Volver a conversaciones" : "Archivadas"}
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={onSettings}
        >
          <Settings2 /> Ajustes{" "}
          <span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 rotate-45",
                w.connected ? "bg-brand-detail" : "border border-muted-foreground",
              )}
            />
            {w.busy
              ? "Sincronizando"
              : w.connected
                ? "Conectado"
                : "Sin conectar"}
          </span>
        </Button>
      </div>
    </nav>
  );
}
