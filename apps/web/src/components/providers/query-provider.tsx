"use client";

import { useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";

/**
 * No reintentar ante errores 4xx: el 401 ya lo gestiona api-client (refresh
 * single-flight + reintento), y otros 4xx (404/409/422) son definitivos. Solo
 * reintentamos errores sin status (red/transitorios), una vez. Así el retry de
 * TanStack no compite con el refresh ni genera dobles peticiones.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) return false;
  return failureCount < 1;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: shouldRetry,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}
