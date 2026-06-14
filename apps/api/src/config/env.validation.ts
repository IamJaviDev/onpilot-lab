/**
 * Validación ligera de variables de entorno para ConfigModule.
 * No usa class-validator: solo comprueba presencia de las claves críticas
 * y corta el arranque (lanza Error) si falta alguna, en vez de fallar más
 * tarde con un error opaco en runtime.
 */
const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_ACCESS_TTL',
  'REFRESH_TOKEN_TTL',
] as const;

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const missing = REQUIRED_ENV_VARS.filter((key) => {
    const value = config[key];
    return value === undefined || value === '';
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  return config;
}
