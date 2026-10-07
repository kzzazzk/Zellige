import type { components, operations } from "./generated/schema";

// Stable names for consumers; the backend owns every wire field.
export type Branch = components["schemas"]["Branch"];
export type Item = components["schemas"]["Item"];
export type History = components["schemas"]["BranchHistoryResponse"];
export type Run = components["schemas"]["Run"];
export type Profile = components["schemas"]["CreateRuntimeProfileResponse"];
export type Change = components["schemas"]["Change"];
export type Changes = components["schemas"]["ChangesResponse"];
export type Conversation = components["schemas"]["Conversation"];
export type ConversationPage = components["schemas"]["ConversationListResponse"];
export type ErrorResponse = components["schemas"]["ErrorResponse"];

type JsonContent<T> = T extends { content: { "application/json": infer Body } }
  ? Body
  : never;

export type ResponseBody<Id extends keyof operations> = JsonContent<
  operations[Id]["responses"][keyof operations[Id]["responses"] & (200 | 201)]
>;
export type RequestBody<Id extends keyof operations> = JsonContent<
  operations[Id] extends { requestBody: infer Body } ? Body : never
>;
export type QueryParameters<Id extends keyof operations> = NonNullable<
  operations[Id]["parameters"]["query"]
>;

// Transport metadata and errors remain handwritten.
export type ApiResult<T> = { status: number; data: T };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string | null = null,
    readonly details: ErrorResponse["error"]["details"] = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
