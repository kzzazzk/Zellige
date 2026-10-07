import { ApiError } from "../../api/types";
import type { Failure } from "./types";

export function describeError(error: unknown): Failure {
  if (!(error instanceof ApiError))
    return {
      message: "No se pudo completar la operación. Vuelve a intentarlo.",
      status: null,
      code: null,
      details: null,
    };
  const messages: Record<string, string> = {
    unauthorized: "La clave de acceso no es válida. Revísala en Ajustes.",
    already_exists:
      "Ya existe un perfil o un nombre igual. Prueba con otro nombre.",
    head_conflict:
      "La conversación ha cambiado en otro dispositivo. Revisa el historial y vuelve a enviar tu borrador.",
    conversation_conflict:
      "La conversación ha cambiado. Actualízala antes de guardar de nuevo.",
    invalid_branch: "No se pudo crear la rama. Usa un nombre distinto.",
  };
  return {
    message: messages[error.code ?? ""] ?? error.message,
    status: error.status,
    code: error.code,
    details: error.details,
  };
}
