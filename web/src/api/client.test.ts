import { describe, expect, it, vi } from "vitest";
import { createClient } from "./client";

describe("API client", () => {
  it("sends a bearer token only to v1 and parses successful JSON", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response('{"status":"ok"}', {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = createClient(() => "secret");
    expect(
      (await client.request<{ status: string }>("/health")).data.status,
    ).toBe("ok");
    await client.request("/v1/changes");
    expect(
      (fetchMock.mock.calls[0][1].headers as Headers).has("Authorization"),
    ).toBe(false);
    expect(
      (fetchMock.mock.calls[1][1].headers as Headers).get("Authorization"),
    ).toBe("Bearer secret");
  });

  it("exposes structured HTTP conflicts without retrying", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "head_conflict",
              message: "branch head has changed",
              details: { actual_head_item_id: "item-2" },
            },
          }),
          { status: 409 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createClient(() => "x").request("/v1/changes"),
    ).rejects.toMatchObject({
      status: 409,
      code: "head_conflict",
      details: { actual_head_item_id: "item-2" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
