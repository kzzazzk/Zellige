import { GitBranch, LoaderCircle, PanelLeft, PanelRight, Pencil } from "lucide-react";
import type { Conversation } from "../api/types";
import type { Thread } from "../features/workspace/types";
import { Button } from "../components/ui/button";
import { NativeSelect, NativeSelectOption } from "../components/ui/native-select";

interface Props {
  thread: Thread | null;
  busy: boolean;
  selectConversation: (id: string, branchId?: string) => Promise<boolean>;
  rename: (conversation: Conversation) => void;
  fork: (head: string | null) => void;
  onOpenNav: () => void;
  onDetails: () => void;
}

export function WorkspaceHeader(w: Props) {
  const { rename, fork, onOpenNav, onDetails } = w;
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-seam-soft px-3 sm:px-5">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Abrir conversaciones"
        onClick={() => onOpenNav()}
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
        onClick={() => onDetails()}
      >
        <PanelRight />
      </Button>
    </header>
  );
}
