// Límites de rate limiting por IP para los endpoints de autenticación.
// Constantes en código (sin env vars): frenan fuerza bruta/abuso sin molestar
// al uso legítimo. `ttl` en milisegundos (formato de @nestjs/throttler v6).
const MINUTE_MS = 60_000;

export const AUTH_THROTTLE = {
  login: { limit: 5, ttl: MINUTE_MS },
  register: { limit: 3, ttl: MINUTE_MS },
  refresh: { limit: 10, ttl: MINUTE_MS },
} as const;
