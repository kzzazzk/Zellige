import { Button } from "../ui/button";
import { BrandGreeting } from "../Brand";

const SUGGESTIONS = [
  "Planifica un viaje de dos días",
  "Resume una idea en tres puntos",
  "Compara dos enfoques para un proyecto",
];

export function ChatEmptyState({ connected, busy, onSettings, onSuggestion }: {
  connected: boolean;
  busy: boolean;
  onSettings: () => void;
  onSuggestion: (suggestion: string) => void;
}) {
  return (
            <div className="flex min-h-[55vh] flex-col items-center justify-center py-10 text-center">
              <BrandGreeting className="mb-6 sm:mb-8" />
              <p className="eyebrow">
                {connected ? "Tu espacio para pensar" : "Sin conectar"}
              </p>
              <h1 className="mt-3 text-3xl font-medium tracking-[-0.04em]">
                {connected ? "Empieza una " : "Tu espacio para "}
                <em className="font-serif text-[1.2em] font-normal text-brand-detail">
                  {connected ? "conversación" : "conversar"}
                </em>
              </h1>
              <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
                {connected
                  ? "Guarda tus ideas y explora distintas ramas. El historial sigue siendo el mismo al cambiar de perfil."
                  : "Conecta con tu servidor Zellige para recuperar tus conversaciones desde este dispositivo."}
              </p>
              {connected ? (
                <div className="mt-7 flex max-w-xl flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      disabled={busy}
                      className="rounded-full border bg-popover/60 px-3.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:border-seam hover:text-foreground disabled:opacity-50"
                      onClick={() => {
                        onSuggestion(suggestion);
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
  );
}
