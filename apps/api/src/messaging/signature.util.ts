import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_PREFIX = 'sha256=';

/**
 * Valida el header `X-Hub-Signature-256` (`sha256=<hex>`) como HMAC-SHA256 del
 * cuerpo CRUDO con el App Secret de Meta.
 *
 * Pura y sin dependencias (crypto de Node): es la unidad testeada en el CHECK.
 * Devuelve false —nunca lanza— ante header ausente, malformado (sin prefijo
 * `sha256=` o hex inválido), longitud distinta o firma incorrecta.
 */
export function isValidSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith(SIGNATURE_PREFIX)) return false;

  const expected = createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');
  const received = signatureHeader.slice(SIGNATURE_PREFIX.length);
  const expectedBuf = Buffer.from(expected, 'hex');
  const receivedBuf = Buffer.from(received, 'hex');
  if (expectedBuf.length !== receivedBuf.length) return false;

  return timingSafeEqual(expectedBuf, receivedBuf);
}
