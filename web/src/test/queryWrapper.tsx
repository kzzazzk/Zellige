import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createWorkspaceQueryClient } from "../features/workspace/queryClient";

export function createQueryWrapper() {
  const queryClient = createWorkspaceQueryClient();
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { queryClient, wrapper };
}
