import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from "@/lib/auth/token-store";

/**
 * Cliente HTTP del frontend.
 *
 * - Todas las rutas son relativas a `/api/*` → mismo origen vía rewrites de
 *   Next, así la cookie httpOnly del refresh viaja sola y no hay CORS.
 * - `credentials: "include"` para que la cookie se envíe en /api/auth/*.
 * - Inyecta `Authorization: Bearer <accessToken>` desde el almacén en memoria.
 * - Ante un 401 en una petición autenticada, refresca UNA vez (single-flight)
 *   y reintenta. El propio refresh nunca se auto-refresca (evita recursión).
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const REFRESH_PATH = "/api/auth/refresh";

async function rawFetch(
  path: string,
  init: RequestInit,
  withAuth: boolean,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (withAuth) {
    const token = getAccessToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }
  return fetch(path, { ...init, headers, credentials: "include" });
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) {
    return undefined as T;
  }
  const isJson = res.headers
    .get("content-type")
    ?.includes("application/json");
  const body = isJson ? await res.json() : undefined;
  if (!res.ok) {
    throw new ApiError(res.status, extractMessage(body, res.statusText), body);
  }
  return body as T;
}

function extractMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === "string") return message;
    if (Array.isArray(message) && typeof message[0] === "string") {
      return message[0];
    }
  }
  return fallback;
}

/**
 * Refresco single-flight: si llegan varios 401 a la vez, todos comparten una
 * ÚNICA promesa de refresh → una sola rotación del token en el backend. Esto
 * evita disparar la detección de reuso (que revocaría toda la familia) y los
 * deslogueos misteriosos. Compartido con el bootstrap de sesión (F5).
 */
let inflightRefresh: Promise<string> | null = null;

export function refreshAccessToken(): Promise<string> {
  if (!inflightRefresh) {
    inflightRefresh = (async () => {
      try {
        const res = await rawFetch(REFRESH_PATH, { method: "POST" }, false);
        const data = await parse<{ accessToken: string }>(res);
        setAccessToken(data.accessToken);
        return data.accessToken;
      } catch (error) {
        clearAccessToken();
        throw error;
      } finally {
        inflightRefresh = null;
      }
    })();
  }
  return inflightRefresh;
}

/** Petición autenticada con auto-refresh + reintento (una vez) ante 401. */
export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let res = await rawFetch(path, init, true);
  if (res.status === 401 && path !== REFRESH_PATH) {
    await refreshAccessToken();
    res = await rawFetch(path, init, true);
  }
  return parse<T>(res);
}

/** Petición pública sin Bearer y sin auto-refresh (login, registro, logout). */
export async function publicRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await rawFetch(path, init, false);
  return parse<T>(res);
}
