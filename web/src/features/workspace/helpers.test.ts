import { describe, expect, it } from "vitest";
import { createClient } from "../../api/client";
import { appendMessage, createBranch, createConversation } from "../../api/conversations";
import { createRun } from "../../api/runs";
import { ApiError } from "../../api/types";
import { apiFixture } from "../../test/apiFixture";
import { draftKey } from "./draftKey";
import { describeError } from "./errors";
import { loadThread } from "./loadThread";
import type { Thread } from "./types";

function threadIds(conversationId: string, branchId: string) {
  return {
    conversation: { id: conversationId },
    branch: { id: branchId },
  } as Thread;
}

describe("workspace helpers", () => {
  it("keeps the existing new-chat key and collision-safe thread keys", () => {
    expect(draftKey(null)).toBe("new");
    expect(draftKey(threadIds("conv-1", "branch-1"))).toBe('["conv-1","branch-1"]');
    expect(draftKey(threadIds("a:b", "c"))).not.toBe(draftKey(threadIds("a", "b:c")));
    expect(draftKey(threadIds('a", "b', "c"))).not.toBe(draftKey(threadIds("a", 'b", "c')));
    expect(draftKey(threadIds("new", ""))).not.toBe("new");
  });

  it.each([
    ["unauthorized", "La clave de acceso no es válida. Revísala en Ajustes."],
    ["already_exists", "Ya existe un perfil o un nombre igual. Prueba con otro nombre."],
    ["head_conflict", "La conversación ha cambiado en otro dispositivo. Revisa el historial y vuelve a enviar tu borrador."],
    ["conversation_conflict", "La conversación ha cambiado. Actualízala antes de guardar de nuevo."],
    ["invalid_branch", "No se pudo crear la rama. Usa un nombre distinto."],
    ["unknown", "server message"],
  ])("describes %s without dropping API metadata", (code, message) => {
    const details = { head: "item-2" };
    expect(describeError(new ApiError("server message", 409, code, details))).toEqual({ message, status: 409, code, details });
  });

  it("uses the generic error for non-API failures and retains uncoded API messages", () => {
    expect(describeError(new Error("private details"))).toEqual({
      message: "No se pudo completar la operación. Vuelve a intentarlo.",
      status: null, code: null, details: null,
    });
    expect(describeError(new ApiError("connection", null)).message).toBe("connection");
  });

  it("loads the requested branch, falls back to the first, and includes conversation runs", async () => {
    apiFixture();
    const client = createClient(() => "secret");
    const { conversation, branch } = (await createConversation(client, "A")).data;
    const fork = (await createBranch(client, conversation.id, "fork", null)).data;
    const item = (await appendMessage(client, conversation.id, fork.id, null, "fork message")).data;
    const run = (await createRun(client, conversation.id, fork.id, "profilev-1")).data;
    const loaded = await loadThread(client, conversation.id, fork.id);
    expect(loaded).toMatchObject({
      conversation: { id: conversation.id },
      branch: { id: fork.id, head_item_id: item.id },
      items: [item], runs: [run],
    });
    expect(loaded.branches).toHaveLength(2);
    expect((await loadThread(client, conversation.id, "missing")).branch.id).toBe(branch.id);
    expect((await loadThread(client, conversation.id)).items).toEqual([]);
  });

  it("retains the no-branches 404 and propagates read failures", async () => {
    const fixture = apiFixture();
    const client = createClient(() => "secret");
    const { conversation } = (await createConversation(client, "A")).data;
    fixture.failNext("GET", `/v1/conversations/${conversation.id}/runs`);
    await expect(loadThread(client, conversation.id)).rejects.toMatchObject({ status: 500 });
    fixture.branches.splice(0);
    await expect(loadThread(client, conversation.id)).rejects.toMatchObject({
      status: 404, message: "Esta conversación no tiene ramas.",
    });
  });
});
