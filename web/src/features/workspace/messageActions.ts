import type { Dispatch, SetStateAction } from "react";
import type { Client } from "../../api/client";
import type { Operation } from "./useWorkspaceOperation";
import type { Thread } from "./types";
import { appendMessage, createBranch, createConversation } from "../../api/conversations";
import { ApiError } from "../../api/types";
import { draftKey as getDraftKey } from "./draftKey";
import { loadThread } from "./loadThread";

type Dependencies = Pick<Operation, "perform" | "record" | "setFailure"> & {
  client: Client;
  thread: Thread | null;
  setThread: Dispatch<SetStateAction<Thread | null>>;
  refreshList: () => Promise<void>;
  transferDraft: (from: string, to: string, value: string) => void;
  clearDraft: (key: string) => void;
};
export function messageActions({ client, thread, setThread, perform, record, setFailure,
  refreshList, transferDraft, clearDraft }: Dependencies) {
  function sendMessage(text: string) {
    return perform(async () => {
      if (!text.trim()) throw new ApiError("Escribe un mensaje primero.", null);
      let active = thread;
      if (!active) {
        const created = record(
          await createConversation(client, text.trim().slice(0, 80)),
        );
        active = {
          conversation: created.conversation,
          branches: [created.branch],
          branch: created.branch,
          items: [],
          runs: [],
        };
        setThread(active);
        const createdKey = getDraftKey(active);
        transferDraft("new", createdKey, text);
      }
      const target = active;
      try {
        const item = record(
          await appendMessage(
            client,
            target.conversation.id,
            target.branch.id,
            target.branch.head_item_id,
            text.trim(),
          ),
        );
        setThread({
          ...target,
          branch: { ...target.branch, head_item_id: item.id },
          items: [...target.items, item],
        });
        const savedKey = getDraftKey(target);
        clearDraft(savedKey);
      } catch (error) {
        if (error instanceof ApiError && error.code === "head_conflict") {
          try {
            setThread(
              await loadThread(
                client,
                target.conversation.id,
                target.branch.id,
              ),
            );
          } catch {
            /* The original conflict remains visible; manual refresh is available. */
          }
        }
        throw error;
      }
      // The append succeeded; a failed follow-up read must not prompt a duplicate send.
      try {
        await refreshList();
        setThread(
          await loadThread(client, target.conversation.id, target.branch.id),
        );
      } catch {
        setFailure({
          message:
            "Mensaje guardado. No se pudo actualizar la lista; pulsa Actualizar.",
          status: null,
          code: null,
          details: null,
        });
      }
    });
  }

  function fork(name: string, parent: string | null, editedText?: string) {
    return perform(async () => {
      if (!thread) return;
      const target = thread;
      const branch = record(
        await createBranch(client, target.conversation.id, name.trim(), parent),
      );
      setThread(await loadThread(client, target.conversation.id, branch.id));
      if (editedText !== undefined) {
        record(
          await appendMessage(
            client,
            target.conversation.id,
            branch.id,
            parent,
            editedText,
          ),
        );
        setThread(await loadThread(client, target.conversation.id, branch.id));
      }
      await refreshList();
    });
  }

  return { sendMessage, fork };
}
