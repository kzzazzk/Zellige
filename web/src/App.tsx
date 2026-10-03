import { useEffect, useState } from "react";
import {
  ArchiveRestore,
  GitBranch,
  LoaderCircle,
  PanelLeft,
  PanelRight,
  Pencil,
  X,
} from "lucide-react";
import type { Conversation } from "./api/types";
import { useWorkspace } from "./features/useWorkspace";
import { Chat } from "./components/Chat";
import { Sidebar } from "./components/Sidebar";
import { Settings } from "./components/Settings";
import { Inspector } from "./components/Inspector";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "./components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "./components/ui/sheet";

function savedDarkMode() {
  try {
    return localStorage.getItem("zellige-theme") !== "light";
  } catch {
    return true;
  }
}

type NamePrompt =
  | { kind: "rename"; conversation: Conversation }
  | { kind: "branch"; head: string | null };

export function App() {
  const w = useWorkspace();
  const [dark, setDark] = useState(savedDarkMode);
  const [settings, setSettings] = useState(false);
  const [inspector, setInspector] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [prompt, setPrompt] = useState<NamePrompt | null>(null);
  const [name, setName] = useState("");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("zellige-theme", dark ? "dark" : "light");
    } catch {
      /* Theme still works without storage. */
    }
  }, [dark]);

  function rename(conversation: Conversation) {
    setPrompt({ kind: "rename", conversation });
    setName(conversation.title);
  }
  function fork(head: string | null) {
    setPrompt({ kind: "branch", head });
    setName(`Rama ${(w.thread?.branches.length ?? 0) + 1}`);
  }
  async function submitName() {
    if (!prompt || !name.trim()) return;
    const ok =
      prompt.kind === "rename"
        ? await w.changeConversation(prompt.conversation, {
            title: name.trim(),
          })
        : await w.fork(name, prompt.head);
    if (ok) setPrompt(null);
  }

  const sidebar = (
    <Sidebar
      workspace={w}
      onSettings={() => {
        setMobileNav(false);
        setSettings(true);
      }}
      onRename={rename}
      onNavigate={() => setMobileNav(false)}
    />
  );
  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="hidden w-64 shrink-0 border-r border-seam-soft md:block">
        {sidebar}
      </aside>
      <Sheet open={mobileNav} onOpenChange={setMobileNav}>
        <SheetContent side="left" className="w-72 p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Conversaciones</SheetTitle>
          {sidebar}
        </SheetContent>
      </Sheet>
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-seam-soft px-3 sm:px-5">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Abrir conversaciones"
            onClick={() => setMobileNav(true)}
          >
            <PanelLeft />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium tracking-[-0.01em]">
              {w.thread?.conversation.title ?? "Nueva conversación"}
            </p>
          </div>
          {w.busy && (
            <span role="status" aria-label="Sincronizando">
              <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
            </span>
          )}
          {w.thread && (
            <>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Renombrar conversación"
                title="Renombrar"
                disabled={w.busy}
                onClick={() => rename(w.thread!.conversation)}
              >
                <Pencil />
              </Button>
              <NativeSelect
                aria-label="Rama"
                value={w.thread.branch.id}
                onChange={(event) =>
                  void w.selectConversation(
                    w.thread!.conversation.id,
                    event.target.value,
                  )
                }
                disabled={w.busy}
                className="max-w-28 sm:max-w-44"
              >
                {w.thread.branches.map((branch) => (
                  <NativeSelectOption key={branch.id} value={branch.id}>
                    {branch.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Nueva rama"
                title="Nueva rama"
                disabled={w.busy}
                onClick={() => fork(w.thread!.branch.head_item_id)}
              >
                <GitBranch />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Detalles de la conversación"
            title="Detalles"
            onClick={() => setInspector(true)}
          >
            <PanelRight />
          </Button>
        </header>
        {w.thread?.conversation.archived_at && (
          <div className="flex items-center justify-center gap-3 border-b bg-muted px-4 py-2 text-xs text-muted-foreground">
            <span>Esta conversación está archivada.</span>
            <Button
              variant="ghost"
              disabled={w.busy}
              onClick={() =>
                void w.changeConversation(w.thread!.conversation, {
                  archived: false,
                })
              }
            >
              <ArchiveRestore />
              Restaurar
            </Button>
          </div>
        )}
        {w.failure && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 border-b bg-destructive/10 px-5 py-3 text-xs leading-5 text-destructive"
          >
            <span>{w.failure.message}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Cerrar aviso"
              onClick={w.dismissError}
            >
              <X />
            </Button>
          </div>
        )}
        <Chat
          key={w.connected ? "connected" : "disconnected"}
          workspace={w}
          onDetails={() => setInspector(true)}
          onSettings={() => setSettings(true)}
          onFork={fork}
        />
      </main>
      {settings && (
        <Settings
          workspace={w}
          onClose={() => setSettings(false)}
          dark={dark}
          onTheme={() => setDark(!dark)}
        />
      )}
      {inspector && (
        <Inspector workspace={w} onClose={() => setInspector(false)} />
      )}
      <Dialog
        open={prompt !== null}
        onOpenChange={(open) => {
          if (!open) setPrompt(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {prompt?.kind === "rename"
                ? "Renombrar conversación"
                : "Crear rama"}
            </DialogTitle>
            <DialogDescription>
              {prompt?.kind === "rename"
                ? "El historial se conserva al cambiar el nombre."
                : "La rama empezará en el mensaje seleccionado. El historial original se conserva."}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submitName();
            }}
            className="space-y-4"
          >
            <Input
              aria-label="Nombre"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={w.busy}
              autoFocus
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={w.busy}
                onClick={() => setPrompt(null)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={w.busy || !name.trim()}>
                Guardar
              </Button>
            </DialogFooter>
          </form>
          {w.failure && <p className="text-destructive">{w.failure.message}</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
