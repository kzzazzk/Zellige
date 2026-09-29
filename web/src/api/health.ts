import type { Client } from "./client";

export function getHealth(client: Client) {
  return client.request<{ status: "ok"; database: string }>("/health");
}
