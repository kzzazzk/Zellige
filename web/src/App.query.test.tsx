import { act, render, waitFor, within } from "@testing-library/react";
import { createMemoryHistory } from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { apiFixture } from "./test/apiFixture";
import { createClient } from "./api/client";
import { createConversation } from "./api/conversations";
import * as queryClientFactory from "./features/workspace/queryClient";
import { workspaceKeys } from "./features/workspace/queryKeys";

describe("App Query providers", () => {
  it("owns a distinct client per App and routes cache updates to only that App", async () => {
    apiFixture();
    const conversation = (await createConversation(createClient(() => "secret"), "First App cache")).data.conversation;
    const clients = vi.spyOn(queryClientFactory, "createWorkspaceQueryClient");
    try {
      const first = render(<App history={createMemoryHistory({ initialEntries: ["/"] })} />);
      const second = render(<App history={createMemoryHistory({ initialEntries: ["/"] })} />);
      await waitFor(() => expect(within(first.container).getByLabelText("Mensaje")).toBeInTheDocument());
      await waitFor(() => expect(within(second.container).getByLabelText("Mensaje")).toBeInTheDocument());
      expect(clients).toHaveBeenCalledTimes(2);
      const firstClient = clients.mock.results[0].value;
      const secondClient = clients.mock.results[1].value;
      expect(firstClient).not.toBe(secondClient);
      act(() => firstClient.setQueryData(workspaceKeys.conversations(false, ""), { conversations: [conversation], has_more: false }));
      expect(within(first.container).getByRole("button", { name: "First App cache" })).toBeInTheDocument();
      expect(within(second.container).queryByRole("button", { name: "First App cache" })).not.toBeInTheDocument();
      expect(secondClient.getQueryCache().getAll()).toEqual([]);
    } finally {
      clients.mockRestore();
    }
  });
});
