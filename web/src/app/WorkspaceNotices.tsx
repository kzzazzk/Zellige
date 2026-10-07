import { ArchiveRestore, X } from "lucide-react";
import type { Conversation } from "../api/types";
import type { Failure } from "../features/workspace/types";
import { Button } from "../components/ui/button";

type Props = {
  conversation?: Conversation;
  busy: boolean;
  failure: Failure | null;
  changeConversation: (conversation: Conversation, change: { title?: string; archived?: boolean }) => Promise<boolean>;
  dismissError: () => void;
};

export function WorkspaceNotices(w: Props) {
  return (
    <>
      {w.conversation?.archived_at && (
        <div className="flex items-center justify-center gap-3 border-b bg-muted px-4 py-2 text-xs text-muted-foreground">
          <span>Esta conversación está archivada.</span>
          <Button
            variant="ghost"
            disabled={w.busy}
            onClick={() =>
              void w.changeConversation(w.conversation!, {
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
    </>
  );
}
