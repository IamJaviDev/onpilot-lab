import type { CookieOptions } from 'express';
import type { ConfigService } from '@nestjs/config';
import { parseDurationMs } from './auth.service';

/**
 * Nombre de la cookie httpOnly que transporta el refresh token.
 * El refresh NUNCA viaja en el body de una respuesta: solo aquí.
 */
export const REFRESH_COOKIE_NAME = 'onpilot_rt';

/**
 * Flags base de la cookie de refresh.
 * - httpOnly: inaccesible desde JS (mitiga robo por XSS).
 * - secure: solo HTTPS en producción; false en dev (http://localhost).
 * - sameSite 'strict': el navegador no la envía en peticiones cross-site,
 *   lo que sirve de mitigación CSRF para el MVP.
 * - path '/api/auth': solo se envía a los endpoints de auth, no al resto de la API.
 */
function baseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth',
  };
}

/** Opciones para setear la cookie, con maxAge = TTL del refresh token. */
export function buildRefreshCookieOptions(
  config: ConfigService,
): CookieOptions {
  const maxAge = parseDurationMs(
    config.getOrThrow<string>('REFRESH_TOKEN_TTL'),
  );
  return { ...baseCookieOptions(), maxAge };
}

/** Opciones para limpiar la cookie (deben coincidir en flags/path con el set). */
export function clearRefreshCookieOptions(): CookieOptions {
  return baseCookieOptions();
}
