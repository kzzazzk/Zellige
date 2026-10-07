import type { Client } from "./client";
import type { ResponseBody } from "./types";

export function getHealth(client: Client) {
  return client.request<ResponseBody<"getHealth">>("/health");
}
