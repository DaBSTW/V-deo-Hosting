/** Error de la API con el mensaje ya traducido por el servidor. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Llamada JSON a nuestra API (cookies incluidas). Lanza `ApiError` con el
 * mensaje que devuelve el servidor (en el idioma del usuario).
 */
export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, { ...init, headers, credentials: "same-origin" });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.details?.[0] ?? data.error ?? res.statusText, res.status, data.code);
  }
  return data as T;
}
