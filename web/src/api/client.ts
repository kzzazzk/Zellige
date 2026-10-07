import { ApiError, type ApiResult, type ErrorResponse } from "./types";

type ErrorBody = {
  error?: Partial<ErrorResponse["error"]>;
};

export function createClient(getToken: () => string) {
  async function request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<ApiResult<T>> {
    const headers = new Headers(options.headers);
    if (path.startsWith("/v1/")) {
      const token = getToken().trim();
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }
    if (options.body !== undefined)
      headers.set("Content-Type", "application/json");
    let response: Response;
    try {
      response = await fetch(path, { ...options, headers });
    } catch {
      throw new ApiError("No se pudo conectar con el servidor.", null);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ApiError(
        "El servidor no devolvió JSON válido.",
        response.status,
      );
    }
    if (!response.ok) {
      const error = (body && typeof body === "object" ? body : {}) as ErrorBody;
      throw new ApiError(
        error.error?.message ?? `Error HTTP ${response.status}`,
        response.status,
        error.error?.code ?? null,
        error.error?.details ?? null,
      );
    }
    return { status: response.status, data: body as T };
  }
  return { request };
}

export type Client = ReturnType<typeof createClient>;
