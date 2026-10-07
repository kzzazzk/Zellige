import { useWorkspaceNavigation } from "./useWorkspaceNavigation";
import { useState } from "react";
import { useWorkspace } from "../features/useWorkspace";
import { Chat } from "../components/Chat";
import { Sidebar } from "../components/Sidebar";
import { Settings } from "../components/Settings";
import { Inspector } from "../components/Inspector";
import { useTheme } from "./useTheme";
import { useNamePrompt } from "./useNamePrompt";
import { WorkspaceLayout } from "./WorkspaceLayout";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { WorkspaceNotices } from "./WorkspaceNotices";
import { NamePromptDialog } from "./NamePromptDialog";

export function WorkspaceApp() {
  const navigation = useWorkspaceNavigation();
  const w = useWorkspace(navigation);
  const { dark, toggleTheme } = useTheme();
  const [settings, setSettings] = useState(false);
  const [inspector, setInspector] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const naming = useNamePrompt({
    conversationId: w.thread?.conversation.id ?? null,
    branchCount: w.thread?.branches.length ?? 0,
    changeConversation: w.changeConversation,
    fork: w.fork,
  });
  const { rename, fork } = naming;

  const sidebar = (
    <Sidebar
      page={w.page}
      selectedId={w.thread?.conversation.id}
      connected={w.connected}
      busy={w.busy}
      archived={w.archived}
      query={w.query}
      refresh={w.refresh}
      newChat={w.newChat}
      search={w.search}
      selectConversation={navigation.selectConversation}
      changeConversation={w.changeConversation}
      loadMore={w.loadMore}
      onSettings={() => {
        setMobileNav(false);
        setSettings(true);
      }}
      onRename={rename}
      onNavigate={() => setMobileNav(false)}
    />
  );
  return (
    <WorkspaceLayout
      sidebar={sidebar}
      mobileNav={mobileNav}
      onMobileNavChange={setMobileNav}
      overlays={
        <>
          {settings && (
            <Settings
              token={w.token}
              connected={w.connected}
              busy={w.busy}
              profiles={w.profiles}
              failure={w.failure}
              connect={w.connect}
              disconnect={w.disconnect}
              addProfile={w.addProfile}
              onClose={() => setSettings(false)}
              dark={dark}
              onTheme={toggleTheme}
            />
          )}
          {inspector && (
            <Inspector
              runs={w.thread?.runs ?? []}
              conversationId={w.thread?.conversation.id}
              branchId={w.thread?.branch.id}
              headItemId={w.thread?.branch.head_item_id}
              profiles={w.profiles}
              connected={w.connected}
              busy={w.busy}
              lastStatus={w.lastStatus}
              lastResponse={w.lastResponse}
              cursor={w.cursor}
              changes={w.changes}
              hasMoreChanges={w.hasMoreChanges}
              readChanges={w.readChanges}
              onClose={() => setInspector(false)}
            />
          )}
          <NamePromptDialog busy={w.busy} failure={w.failure} naming={naming} />
        </>
      }
    >
      <WorkspaceHeader
        thread={w.thread}
        busy={w.busy}
        selectConversation={w.selectConversation}
        rename={rename}
        fork={fork}
        onOpenNav={() => setMobileNav(true)}
        onDetails={() => setInspector(true)}
      />
      <WorkspaceNotices
        conversation={w.thread?.conversation}
        busy={w.busy}
        failure={w.failure}
        changeConversation={w.changeConversation}
        dismissError={w.dismissError}
      />
      <Chat
        key={w.connected ? "connected" : "disconnected"}
        thread={w.thread}
        connected={w.connected}
        busy={w.busy}
        draft={w.draft}
        setDraft={w.setDraft}
        profiles={w.profiles}
        profileId={w.profileId}
        setProfileId={w.setProfileId}
        queuedNotice={w.queuedNotice}
        sendMessage={w.sendMessage}
        fork={w.fork}
        queueRun={w.queueRun}
        onDetails={() => setInspector(true)}
        onSettings={() => setSettings(true)}
        onFork={fork}
      />
    </WorkspaceLayout>
  );
}
