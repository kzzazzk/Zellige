import { createRootRoute, createRoute, createRouter, Outlet, type RouterHistory } from "@tanstack/react-router";
import { WorkspaceApp } from "./WorkspaceApp";

const root = createRootRoute({ component: Outlet, notFoundComponent: () => null, errorComponent: () => null });
const empty = createRoute({ getParentRoute: () => root, path: "/", component: Outlet });
const conversation = createRoute({ getParentRoute: () => root, path: "/chat/$conversationId", component: Outlet });
const routeTree = root.addChildren([empty, conversation]);
export function createWorkspaceRouter(history?: RouterHistory) {
  return createRouter({
    routeTree,
    history,
    // Keep the workspace mounted while the router resolves its empty matches.
    InnerWrap: ({ children }) => <><WorkspaceApp />{children}</>,
  });
}
export type WorkspaceRouter = ReturnType<typeof createWorkspaceRouter>;
declare module "@tanstack/react-router" {
  interface Register { router: WorkspaceRouter }
  interface HistoryState { workspaceBranch?: string }
}
