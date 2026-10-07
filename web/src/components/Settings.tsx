import { useState } from "react";
import { KeyRound, Moon, Sun } from "lucide-react";
import type { Profile } from "../api/types";
import type { Failure } from "../features/workspace/types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { NativeSelect, NativeSelectOption } from "./ui/native-select";

type SettingsProps = {
  token: string;
  connected: boolean;
  busy: boolean;
  profiles: Profile[];
  failure: Failure | null;
  connect: (token: string) => Promise<boolean>;
  disconnect: () => void;
  addProfile: (name: string, mode: string) => Promise<boolean>;
  onClose: () => void;
  dark: boolean;
  onTheme: () => void;
};

export function Settings(w: SettingsProps) {
  const { onClose, dark, onTheme } = w;
  const [token, setToken] = useState(w.token);
  const [name, setName] = useState("");
  const [mode, setMode] = useState("general");
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajustes</DialogTitle>
          <DialogDescription>
            Conexión, apariencia y perfiles de ejecución.
          </DialogDescription>
        </DialogHeader>
        <section className="space-y-3 border-b pb-5">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <KeyRound className="size-4" /> Tu servidor
          </h2>
          <p className="break-all text-xs text-muted-foreground">
            {window.location.origin}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void w.connect(token).then((ok) => {
                if (ok) onClose();
              });
            }}
            className="space-y-2"
          >
            <label htmlFor="access-key" className="text-xs font-medium">
              Clave de acceso
            </label>
            <Input
              id="access-key"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="La clave que configuraste al iniciar Zellige"
              disabled={w.busy}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              Usa el mismo valor de ZELLIGE_API_TOKEN. Se recuerda en esta
              pestaña hasta que la cierres o desconectes.
            </p>
            <div className="flex gap-2">
              <Button type="submit" disabled={w.busy || !token.trim()}>
                {w.connected ? "Volver a conectar" : "Conectar"}
              </Button>
              {w.connected && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={w.busy}
                  onClick={() => {
                    w.disconnect();
                    setToken("");
                  }}
                >
                  Desconectar
                </Button>
              )}
            </div>
          </form>
        </section>
        <div className="flex items-center justify-between border-b pb-4">
          <span className="text-sm">Apariencia</span>
          <Button variant="outline" onClick={onTheme}>
            {dark ? <Sun /> : <Moon />}
            {dark ? "Usar tema claro" : "Usar tema oscuro"}
          </Button>
        </div>
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Perfiles de ejecución</h2>
          <p className="text-xs leading-5 text-muted-foreground">
            Los perfiles se pueden usar en cualquier conversación. Las
            ejecuciones se guardan en cola; aún no hay agentes conectados.
          </p>
          <ul className="divide-y">
            {w.profiles.map((profile) => (
              <li
                className="flex items-center justify-between gap-3 py-2"
                key={profile.version.id}
              >
                <span>{profile.runtime_profile.name}</span>
                <span className="text-muted-foreground">
                  v{profile.version.version}
                </span>
              </li>
            ))}
          </ul>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void w.addProfile(name, mode).then((ok) => {
                if (ok) setName("");
              });
            }}
            className="space-y-2"
          >
            <label htmlFor="profile-name">Nombre del perfil</label>
            <Input
              id="profile-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Mi perfil"
              disabled={!w.connected || w.busy}
            />
            <div className="flex gap-2">
              <NativeSelect
                aria-label="Tipo de perfil"
                value={mode}
                onChange={(event) => setMode(event.target.value)}
                disabled={!w.connected || w.busy}
              >
                <NativeSelectOption value="general">General</NativeSelectOption>
                <NativeSelectOption value="code">Código</NativeSelectOption>
                <NativeSelectOption value="research">
                  Investigación
                </NativeSelectOption>
                <NativeSelectOption value="personal">
                  Personal
                </NativeSelectOption>
              </NativeSelect>
              <Button
                type="submit"
                disabled={!w.connected || w.busy || !name.trim()}
              >
                Crear perfil
              </Button>
            </div>
          </form>
        </section>
        {w.failure && (
          <p role="alert" className="text-xs text-destructive">
            {w.failure.message}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
