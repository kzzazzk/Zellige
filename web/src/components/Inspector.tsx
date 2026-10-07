import type { Change, Profile, Run } from "../api/types";
import { Button } from "./ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";

type InspectorProps = {
  runs: Run[];
  conversationId?: string;
  branchId?: string;
  headItemId?: string | null;
  profiles: Profile[];
  connected: boolean;
  busy: boolean;
  lastStatus: number | null;
  lastResponse: unknown;
  cursor: number;
  changes: Change[];
  hasMoreChanges: boolean;
  readChanges: () => Promise<boolean>;
  onClose: () => void;
};

export function Inspector(w: InspectorProps) {
  const { onClose } = w;
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Detalles de la conversación</SheetTitle>
          <SheetDescription>
            Ejecuciones y diagnóstico del servidor.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-5 pb-5">
          <section className="space-y-2">
            <h2 className="text-sm font-medium">Ejecuciones</h2>
            {!w.runs.length && (
              <p className="text-muted-foreground">
                Todavía no hay ejecuciones.
              </p>
            )}
            <ul className="divide-y">
              {w.runs.map((run) => (
                <li key={run.id} className="space-y-1 py-3">
                  <div className="flex items-center justify-between">
                    <span>
                      {w.profiles.find(
                        (profile) =>
                          profile.version.id === run.runtime_profile_version_id,
                      )?.runtime_profile.name ?? "Perfil guardado"}
                    </span>
                    <span className="rounded bg-secondary px-2 py-0.5">
                      {run.status === "queued" ? "En cola" : run.status}
                    </span>
                  </div>
                  <code className="block break-all text-[10px] text-muted-foreground">
                    {run.id}
                  </code>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground">
              Las ejecuciones en cola todavía no generan respuestas.
            </p>
          </section>
          <details className="space-y-3 border-t pt-4">
            <summary className="font-medium">Diagnóstico técnico</summary>
            <dl className="space-y-2 text-[11px]">
              {[
                ["conversation_id", w.conversationId],
                ["branch_id", w.branchId],
                ["head_item_id", w.headItemId ?? "null"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="break-all font-mono">{value ?? "—"}</dd>
                </div>
              ))}
            </dl>
            <p>Último estado HTTP: {w.lastStatus ?? "—"}</p>
            <pre className="max-h-60 overflow-auto rounded bg-sidebar p-3 text-[10px]">
              {JSON.stringify(w.lastResponse, null, 2)}
            </pre>
            <p>Cursor de cambios: {w.cursor}</p>
            <Button
              variant="outline"
              disabled={!w.connected || w.busy}
              onClick={() => void w.readChanges()}
            >
              Sincronizar cambios
            </Button>
            {w.hasMoreChanges && (
              <p className="text-muted-foreground">
                Hay más cambios disponibles.
              </p>
            )}
            <ol className="max-h-48 overflow-auto text-[11px]">
              {w.changes.map((change) => (
                <li key={change.seq}>
                  #{change.seq} · {change.entity_type} · {change.operation}
                </li>
              ))}
            </ol>
            <a
              className="inline-block underline underline-offset-4"
              href="/docs"
              target="_blank"
              rel="noreferrer"
            >
              Abrir documentación API
            </a>
          </details>
        </div>
      </SheetContent>
    </Sheet>
  );
}
