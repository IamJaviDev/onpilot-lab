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
  // WhatsApp Cloud API (H2 — webhook de recepción). Fail-fast: un webhook
  // medio-configurado que arranca en silencio es peor que un arranque que falla
  // claro. La resolución de negocio por env (phone_number_id → businessId) es
  // el mecanismo v1-sandbox, sustituible cuando haya registro de números.
  'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_BUSINESS_ID',
  // Token permanente (System User) para el envío por Graph API (Tarea 3).
  'WHATSAPP_ACCESS_TOKEN',
  // API key de Anthropic para el BotEngine (Tarea 4). Mismo criterio fail-fast.
  // BOT_ENGINE_ENABLED NO va aquí: es opcional y su ausencia significa off.
  'ANTHROPIC_API_KEY',
  // Redis para la cola de recordatorios (Tarea 7). La VAR es obligatoria
  // (fail-fast); el SERVIDOR caído no: ioredis reconecta en background y la
  // cola es best-effort. REMINDERS_ENABLED / REMINDERS_LEAD_MINUTES no van
  // aquí: opcionales, su ausencia significa off / antelación por defecto.
  'REDIS_URL',
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
