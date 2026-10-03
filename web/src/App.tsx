import { useState } from "react";
import { RouterProvider, type RouterHistory } from "@tanstack/react-router";
import { createWorkspaceRouter } from "./app/router";
import { QueryClientProvider } from "@tanstack/react-query";
import { createWorkspaceQueryClient } from "./features/workspace/queryClient";

export function App({ history }: { history?: RouterHistory }) {
  const [router] = useState(() => createWorkspaceRouter(history));
  const [queryClient] = useState(createWorkspaceQueryClient);
  return <QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>;
}
