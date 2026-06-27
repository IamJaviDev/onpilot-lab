/**
 * Almacén del access token EN MEMORIA (variable de módulo, fuera de React).
 *
 * - Nunca se persiste en localStorage/sessionStorage: solo vive mientras la
 *   pestaña está abierta. Tras un F5 se recupera la sesión vía /api/auth/refresh
 *   (la cookie httpOnly viaja sola), no desde aquí.
 * - Vive fuera de React para que el cliente HTTP pueda leerlo sin depender del
 *   ciclo de render.
 */

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  accessToken = null;
}
