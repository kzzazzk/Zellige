import { useState } from "react";
import { RouterProvider, type RouterHistory } from "@tanstack/react-router";
import { createWorkspaceRouter } from "./app/router";

export function App({ history }: { history?: RouterHistory }) {
  const [router] = useState(() => createWorkspaceRouter(history));
  return <RouterProvider router={router} />;
}
