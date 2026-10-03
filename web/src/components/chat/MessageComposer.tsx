import type { Ref } from "react";
import { ArrowUp, Play } from "lucide-react";
import type { Profile } from "../../api/types";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { NativeSelect, NativeSelectOption } from "../ui/native-select";

export function MessageComposer({ composerRef, connected, busy, draft, onDraftChange, onSend, profileId, onProfileChange, profiles, hasThread, onQueueRun, queuedNotice, onDetails }: {
  composerRef: Ref<HTMLTextAreaElement>;
  connected: boolean;
  busy: boolean;
  draft: string;
  onDraftChange: (draft: string) => void;
  onSend: () => void;
  profileId: string;
  onProfileChange: (id: string) => void;
  profiles: Profile[];
  hasThread: boolean;
  onQueueRun: () => void;
  queuedNotice: boolean;
  onDetails: () => void;
}) {
  return (
    <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSend();
            }}
            className="rounded-2xl border bg-popover p-2 shadow-[0_18px_40px_-28px_rgb(0_0_0/0.55)] transition-colors focus-within:border-seam"
          >
            <Textarea
              ref={composerRef}
              aria-label="Mensaje"
              placeholder={
                connected
                  ? "Escribe un mensaje…"
                  : "Conecta tu servidor para empezar"
              }
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              disabled={!connected || busy}
              rows={3}
              className="max-h-52 resize-none border-0 bg-transparent p-2 text-[15px] shadow-none focus-visible:ring-0 md:text-[15px] dark:bg-transparent"
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  onSend();
                }
              }}
            />
            <div className="flex items-center justify-between gap-2 border-t border-seam-soft px-1 pt-2">
              <NativeSelect
                aria-label="Perfil de ejecución"
                value={profileId}
                onChange={(event) => onProfileChange(event.target.value)}
                disabled={!connected || busy}
                className="max-w-[55%]"
              >
                <NativeSelectOption value="">Sin perfil</NativeSelectOption>
                {profiles.map((profile) => (
                  <NativeSelectOption
                    key={profile.version.id}
                    value={profile.version.id}
                  >
                    {profile.runtime_profile.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <div className="flex items-center gap-2">
                {profileId && (
                  <Button
                    type="button"
                    variant="ghost"
                    title="Crear ejecución en cola"
                    disabled={busy || !hasThread}
                    onClick={() => onQueueRun()}
                  >
                    <Play /> Encolar
                  </Button>
                )}
                <Button
                  type="submit"
                  size="icon-lg"
                  aria-label="Guardar mensaje"
                  disabled={!connected || busy || !draft.trim()}
                >
                  <ArrowUp />
                </Button>
              </div>
            </div>
          </form>
          {queuedNotice && (
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
    </>
  );
}
