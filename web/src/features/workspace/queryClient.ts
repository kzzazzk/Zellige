import { QueryClient } from "@tanstack/react-query";

export function createWorkspaceQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        gcTime: Infinity,
        // Explicit reads replace the canonical snapshot even when JSON is equal.
        structuralSharing: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
        refetchInterval: false,
      },
      mutations: { retry: false },
    },
  });
}
