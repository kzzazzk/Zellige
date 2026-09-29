import { ConversationPanel } from "./components/ConversationPanel";
import { TechnicalPanel } from "./components/TechnicalPanel";
import { useConsole } from "./features/useConsole";

export function App() {
  const state = useConsole();
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div><h1 className="text-2xl font-bold tracking-tight">Zellige</h1><p className="text-xs text-stone-500">Consola técnica · MVP chat</p></div>
          <div className="flex items-center gap-3">
            <span role="status" className={"rounded-full px-3 py-1 text-xs font-semibold " + (state.health === "ok" ? "bg-emerald-100 text-emerald-900" : state.health === "offline" ? "bg-red-100 text-red-900" : "bg-stone-100 text-stone-700")}>Servidor: {state.health === "ok" ? "conectado" : state.health === "offline" ? "sin conexión" : "comprobando"}</span>
            <button className="text-xs text-emerald-800 underline" onClick={() => void state.checkHealth()}>Comprobar</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <label className="block text-sm font-semibold" htmlFor="api-token">Token API del servidor</label>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <input id="api-token" type="password" autoComplete="off" className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm" value={state.token} onChange={(event) => state.setToken(event.target.value)} placeholder="Bearer token" />
            <button className="text-sm text-stone-600 underline" onClick={() => state.setToken("")}>Borrar token</button>
          </div>
          <p className="mt-2 text-xs text-stone-500">Se guarda solo en sessionStorage de esta pestaña para poder recuperar la conversación tras recargar. No lo uses en un dispositivo compartido.</p>
        </section>
        {state.failure && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <strong>{state.failure.status === 409 && state.failure.code === "head_conflict" ? "Conflicto 409: la rama cambió." : "Error"}</strong> {state.failure.message}
            {state.failure.status === 409 && state.failure.code === "head_conflict" && <p className="mt-1">Historial y cabeza actualizados. El borrador sigue intacto; revisa antes de volver a enviarlo.</p>}
            {state.failure.details && <pre className="mt-2 overflow-auto text-xs">{JSON.stringify(state.failure.details, null, 2)}</pre>}
          </div>
        )}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(20rem,1fr)]">
          <div className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5">
            <ConversationPanel conversationId={state.conversationId} branchId={state.branchId} headItemId={state.headItemId} items={state.items} busy={state.busy} onCreate={state.newConversation} onOpen={state.openExisting} onRefresh={state.refreshHistory} onSend={state.sendMessage} />
          </div>
          <TechnicalPanel active={!!state.conversationId} busy={state.busy} profileVersionId={state.profileVersionId} run={state.run} changes={state.changes} cursor={state.cursor} hasMoreChanges={state.hasMoreChanges} lastStatus={state.lastStatus} lastResponse={state.lastResponse} onProfile={state.newProfile} onRun={state.newRun} onChanges={state.readChanges} />
        </div>
      </main>
    </div>
  );
}
