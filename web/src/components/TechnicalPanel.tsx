import { useState, type FormEvent } from "react";
import type { Change, Run } from "../api/types";

type Props = {
  active: boolean; busy: boolean; profileVersionId: string; run: Run | null;
  changes: Change[]; cursor: number; hasMoreChanges: boolean;
  lastStatus: number | null; lastResponse: unknown;
  onProfile: (name: string) => Promise<void>; onRun: (versionId: string) => Promise<void>;
  onChanges: () => Promise<void>;
};

const inputClass = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm";
const buttonClass = "rounded-lg border border-emerald-800 px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-50";

export function TechnicalPanel(props: Props) {
  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  const effectiveVersion = version || props.profileVersionId;
  function profile(event: FormEvent) { event.preventDefault(); void props.onProfile(name); }
  function run(event: FormEvent) { event.preventDefault(); void props.onRun(effectiveVersion); }
  return (
    <aside className="space-y-5" aria-label="Herramientas técnicas">
      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Ejecución</h2>
        <p className="mt-1 text-sm text-stone-600">Crear un run solo lo deja en cola; aún no hay runner.</p>
        <form onSubmit={profile} className="mt-4 space-y-2">
          <label className="block text-sm font-medium" htmlFor="profile-name">Nombre del perfil</label>
          <input id="profile-name" className={inputClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. pruebas-manuales-1" required />
          <button className={buttonClass} disabled={props.busy || !name.trim()}>Crear perfil</button>
        </form>
        {props.profileVersionId && <p className="mt-2 break-all text-xs text-stone-600">Versión creada: <code>{props.profileVersionId}</code></p>}
        <form onSubmit={run} className="mt-5 space-y-2 border-t border-stone-200 pt-4">
          <label className="block text-sm font-medium" htmlFor="profile-version">ID de versión de perfil</label>
          <input id="profile-version" className={inputClass} value={version} onChange={(event) => setVersion(event.target.value)} placeholder={props.profileVersionId || "runtime_profile_version_id"} />
          <button className={buttonClass} disabled={props.busy || !props.active || !effectiveVersion.trim()}>Crear run</button>
        </form>
        {props.run && <div role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Run <code className="break-all">{props.run.id}</code> · {props.run.status}</div>}
      </section>
      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Cambios / outbox</h2>
        <p className="mt-1 text-sm text-stone-600">Consulta manual global desde el cursor {props.cursor}. No hay sondeo automático.</p>
        <button className={buttonClass + " mt-3"} onClick={() => void props.onChanges()} disabled={props.busy}>Consultar cambios</button>
        {props.hasMoreChanges && <p className="mt-2 text-xs text-amber-800">Hay más cambios; consulta de nuevo.</p>}
        <ol className="mt-3 max-h-48 space-y-1 overflow-auto text-xs text-stone-600">
          {props.changes.map((change) => <li key={change.seq}><code>#{change.seq}</code> {change.entity_type} · {change.operation}</li>)}
        </ol>
      </section>
      <details className="rounded-xl border border-stone-200 bg-white p-4">
        <summary className="cursor-pointer text-lg font-semibold">Última respuesta HTTP</summary>
        <p className="mt-2 text-sm">Estado: <code>{props.lastStatus ?? "—"}</code></p>
        <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-stone-950 p-3 text-xs text-stone-100">{JSON.stringify(props.lastResponse, null, 2) ?? "—"}</pre>
      </details>
    </aside>
  );
}
