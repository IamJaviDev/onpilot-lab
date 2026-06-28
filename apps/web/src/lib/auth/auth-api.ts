import { apiRequest, publicRequest } from "@/lib/api-client";
import { setAccessToken } from "@/lib/auth/token-store";
import type { LoginInput, RegisterBusinessInput } from "@/lib/auth/schemas";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export interface ActiveBusiness {
  id: string;
  name: string;
  role: string;
  timezone: string;
}

export interface MeResponse {
  user: SessionUser;
  activeBusiness: ActiveBusiness | null;
}

interface AuthTokenResponse {
  accessToken: string;
}

/**
 * Login. El backend setea la cookie httpOnly del refresh y devuelve el access
 * en el body. Guardamos el access en memoria; la sesión se hidrata luego con
 * meRequest() para tener forma canónica (user + activeBusiness).
 */
export async function loginRequest(input: LoginInput): Promise<void> {
  const data = await publicRequest<AuthTokenResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
  setAccessToken(data.accessToken);
}

export async function registerBusinessRequest(
  input: RegisterBusinessInput,
): Promise<void> {
  const payload = { ...input, city: input.city || undefined };
  const data = await publicRequest<AuthTokenResponse>(
    "/api/auth/register-business",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  setAccessToken(data.accessToken);
}

export function meRequest(): Promise<MeResponse> {
  return apiRequest<MeResponse>("/api/auth/me");
}

export function logoutRequest(): Promise<void> {
  return publicRequest<void>("/api/auth/logout", { method: "POST" });
}
