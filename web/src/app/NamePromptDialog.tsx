import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import type { Failure } from "../features/workspace/types";
import type { useNamePrompt } from "./useNamePrompt";

interface Props {
  busy: boolean;
  failure: Failure | null;
  naming: ReturnType<typeof useNamePrompt>;
}

export function NamePromptDialog(w: Props) {
  const { prompt, name, setName, submitName, close } = w.naming;
  return (
    <Dialog
      open={prompt !== null}
      onOpenChange={(open) => {
        if (!open) close();
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
              onClick={() => close()}
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
  );
}
