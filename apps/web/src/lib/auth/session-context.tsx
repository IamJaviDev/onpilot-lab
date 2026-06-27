"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { refreshAccessToken } from "@/lib/api-client";
import { clearAccessToken } from "@/lib/auth/token-store";
import {
  loginRequest,
  logoutRequest,
  meRequest,
  registerBusinessRequest,
  type ActiveBusiness,
  type SessionUser,
} from "@/lib/auth/auth-api";
import type { LoginInput, RegisterBusinessInput } from "@/lib/auth/schemas";

type SessionStatus = "loading" | "authenticated" | "unauthenticated";

interface SessionContextValue {
  status: SessionStatus;
  user: SessionUser | null;
  activeBusiness: ActiveBusiness | null;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterBusinessInput) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [activeBusiness, setActiveBusiness] = useState<ActiveBusiness | null>(
    null,
  );
  const bootstrapped = useRef(false);

  const hydrate = useCallback(async () => {
    const me = await meRequest();
    setUser(me.user);
    setActiveBusiness(me.activeBusiness);
    setStatus("authenticated");
  }, []);

  const clearSession = useCallback(() => {
    clearAccessToken();
    setUser(null);
    setActiveBusiness(null);
    setStatus("unauthenticated");
  }, []);

  // Bootstrap en montaje (clave para F5): la cookie httpOnly viaja sola, así que
  // intentamos refrescar; si vale → access en memoria + /me; si no → login.
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    (async () => {
      try {
        await refreshAccessToken();
        await hydrate();
      } catch {
        clearSession();
      }
    })();
  }, [hydrate, clearSession]);

  const login = useCallback(
    async (input: LoginInput) => {
      await loginRequest(input);
      await hydrate();
    },
    [hydrate],
  );

  const register = useCallback(
    async (input: RegisterBusinessInput) => {
      await registerBusinessRequest(input);
      await hydrate();
    },
    [hydrate],
  );

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  return (
    <SessionContext.Provider
      value={{ status, user, activeBusiness, login, register, logout }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession debe usarse dentro de <SessionProvider>");
  }
  return ctx;
}
