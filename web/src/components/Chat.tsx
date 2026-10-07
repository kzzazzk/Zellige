import { useEffect, useRef, useState } from "react";
import type { Item, Profile } from "../api/types";
import type { Thread } from "../features/workspace/types";
import { messageText } from "./chat/messageText";
import { ChatEmptyState } from "./chat/ChatEmptyState";
import { ChatHistory } from "./chat/ChatHistory";
import { MessageComposer } from "./chat/MessageComposer";
import { EditBranchPanel } from "./chat/EditBranchPanel";

export { messageText } from "./chat/messageText";

type ChatProps = {
  thread: Thread | null;
  connected: boolean;
  busy: boolean;
  draft: string;
  setDraft: (value: string) => void;
  profiles: Profile[];
  profileId: string;
  setProfileId: (id: string) => void;
  queuedNotice: boolean;
  sendMessage: (text: string) => Promise<boolean>;
  fork: (name: string, parent: string | null, editedText?: string) => Promise<boolean>;
  queueRun: () => Promise<boolean>;
  onSettings: () => void;
  onFork: (head: string | null) => void;
  onDetails: () => void;
};

export function Chat(w: ChatProps) {
  const { onSettings, onFork, onDetails } = w;
  const { draft, setDraft } = w;
  const [editing, setEditing] = useState<Item | null>(null);
  const [editConversationId, setEditConversationId] = useState("");
  const [editText, setEditText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const count = w.thread?.items.length ?? 0;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [count, w.thread?.branch.id]);
  async function send() {
    if (draft.trim()) await w.sendMessage(draft);
  }
  async function saveEdit() {
    if (
      editing &&
      editConversationId === w.thread?.conversation.id &&
      editText.trim() &&
      (await w.fork(
        `Edición ${new Date().toISOString()}`,
        editing.parent_item_id,
        editText.trim(),
      ))
    )
      setEditing(null);
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatHistory
        items={w.thread?.items ?? []}
        busy={w.busy}
        bottomRef={bottom}
        onFork={(entry) => onFork(entry.id)}
        onEdit={(entry) => {
          setEditing(entry);
          setEditText(messageText(entry));
          setEditConversationId(w.thread!.conversation.id);
        }}
        emptyState={
          <ChatEmptyState
            connected={w.connected}
            busy={w.busy}
            onSettings={onSettings}
            onSuggestion={(suggestion) => {
              setDraft(suggestion);
              composer.current?.focus();
            }}
          />
        }
      />
      <div className="shrink-0 px-4 pt-3 pb-4 sm:px-8 sm:pb-6">
        <div className="mx-auto max-w-3xl">
          {editing && editConversationId === w.thread?.conversation.id ? (
            <EditBranchPanel
              text={editText}
              busy={w.busy}
              onChange={setEditText}
              onCancel={() => setEditing(null)}
              onSave={() => void saveEdit()}
            />
          ) : null}
          <MessageComposer
            composerRef={composer}
            connected={w.connected}
            busy={w.busy}
            draft={draft}
            onDraftChange={setDraft}
            onSend={() => void send()}
            profileId={w.profileId}
            onProfileChange={w.setProfileId}
            profiles={w.profiles}
            hasThread={!!w.thread}
            onQueueRun={() => void w.queueRun()}
            queuedNotice={w.queuedNotice}
            onDetails={onDetails}
          />
        </div>
      </div>
    </div>
  );
}
