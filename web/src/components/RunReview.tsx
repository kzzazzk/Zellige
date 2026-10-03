import type { Run } from "../api/types";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function rows(value: unknown): UnknownRecord[] {
  return Array.isArray(value)
    ? value.map(record).filter((entry): entry is UnknownRecord => entry !== null)
    : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length ? value : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function shortSha(value: unknown): string | null {
  const sha = text(value);
  return sha ? sha.slice(0, 8) : null;
}

function commandResult(entry: UnknownRecord) {
  const exit = number(entry.exit_code);
  if (exit === 0) return "✓ exit 0";
  if (exit !== null) return `✕ exit ${exit}`;
  return text(entry.status) ?? "sin resultado";
}

function DiffRows({
  title,
  entries,
}: {
  title: string;
  entries: UnknownRecord[];
}) {
  if (!entries.length) return null;
  return (
    <div className="space-y-1">
      <p className="font-medium">{title}</p>
      <ul className="space-y-1">
        {entries.map((entry, index) => {
          const path = text(entry.path) ?? "archivo";
          const added = number(entry.added);
          const deleted = number(entry.deleted);
          return (
            <li className="flex items-center justify-between gap-3 font-mono text-[11px]" key={`${path}-${index}`}>
              <span className="break-all">{path}</span>
              {(added !== null || deleted !== null) && (
                <span className="shrink-0 text-muted-foreground">
                  +{added ?? "?"} / -{deleted ?? "?"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function RunReview({ run }: { run: Run }) {
  const result = record(run.result);
  const evidence = record(result?.evidence);
  if (!evidence) return null;

  const commands = rows(evidence.commands);
  const fileChanges = rows(evidence.file_changes);
  const git = record(evidence.git);
  const gitAvailable = git?.available === true;
  const statusAfter = rows(git?.status_after);
  const workingDiff = rows(git?.working_diff);
  const committedDiff = rows(git?.committed_diff);
  const headBefore = shortSha(git?.head_before);
  const headAfter = shortSha(git?.head_after);

  return (
    <div className="space-y-3 rounded-md border bg-sidebar/40 p-3">
      <p className="text-xs font-medium">Revisión de ejecución</p>

      {!!commands.length && (
        <div className="space-y-2">
          <p className="text-[11px] font-medium">Comandos verificados</p>
          <ul className="space-y-2">
            {commands.map((entry, index) => {
              const command = text(entry.command);
              if (!command) return null;
              const isTest = entry.kind === "test";
              return (
                <li className="space-y-1" key={`${command}-${index}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px]">
                      {isTest ? "Prueba" : "Comando"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {commandResult(entry)}
                    </span>
                  </div>
                  <code className="block whitespace-pre-wrap break-all rounded bg-background px-2 py-1 text-[10px]">
                    {command}
                  </code>
                </li>
              );
            })}
          </ul>
          {evidence.commands_truncated === true && (
            <p className="text-[10px] text-muted-foreground">
              La lista de comandos fue truncada.
            </p>
          )}
        </div>
      )}

      {!!fileChanges.length && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium">Cambios reportados por Codex</p>
          <ul className="space-y-1 text-[11px]">
            {fileChanges.map((entry, index) => (
              <li className="flex justify-between gap-3" key={`${text(entry.path) ?? "file"}-${index}`}>
                <code className="break-all">{text(entry.path) ?? "archivo"}</code>
                <span className="shrink-0 text-muted-foreground">
                  {text(entry.kind) ?? "change"}
                </span>
              </li>
            ))}
          </ul>
          {evidence.file_changes_truncated === true && (
            <p className="text-[10px] text-muted-foreground">
              La lista de archivos fue truncada.
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-[11px] font-medium">Evidencia Git</p>
        {!gitAvailable ? (
          <p className="text-[10px] text-muted-foreground">
            No disponible para este workspace.
          </p>
        ) : (
          <>
            {git?.dirty_before === true && (
              <p className="text-[10px] text-muted-foreground">
                El workspace ya tenía cambios antes de esta ejecución.
              </p>
            )}
            {headBefore && headAfter && (
              <p className="font-mono text-[10px] text-muted-foreground">
                HEAD {headBefore}
                {headBefore !== headAfter ? ` → ${headAfter}` : ""}
              </p>
            )}
            {!!statusAfter.length && (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">Estado al terminar</p>
                <ul className="space-y-1 font-mono text-[11px]">
                  {statusAfter.map((entry, index) => (
                    <li key={`${text(entry.path) ?? "status"}-${index}`}>
                      <span className="mr-2 text-muted-foreground">
                        {text(entry.code) ?? "??"}
                      </span>
                      {text(entry.path) ?? "archivo"}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <DiffRows title="Cambios sin commit" entries={workingDiff} />
            <DiffRows title="Cambios entre commits" entries={committedDiff} />
            {!statusAfter.length && !workingDiff.length && !committedDiff.length && (
              <p className="text-[10px] text-muted-foreground">
                El workspace terminó sin cambios Git pendientes.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
