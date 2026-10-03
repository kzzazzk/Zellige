import { X } from "lucide-react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

export function EditBranchPanel({ text, busy, onChange, onCancel, onSave }: {
  text: string;
  busy: boolean;
  onChange: (text: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
            <div className="mb-3 space-y-2 rounded-lg border bg-muted p-3">
              <div className="flex items-center justify-between text-xs">
                <span>
                  Editar crea una nueva rama. El original se conserva.
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Cancelar edición"
                  onClick={() => onCancel()}
                >
                  <X />
                </Button>
              </div>
              <Textarea
                aria-label="Texto editado"
                rows={3}
                value={text}
                onChange={(event) => onChange(event.target.value)}
                disabled={busy}
              />
              <Button
                disabled={busy || !text.trim()}
                onClick={() => onSave()}
              >
                Guardar en nueva rama
              </Button>
            </div>
  );
}
