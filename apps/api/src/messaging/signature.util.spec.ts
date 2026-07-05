import { createHmac } from 'node:crypto';
import { isValidSignature } from './signature.util';

/**
 * Test de la validación de firma HMAC del webhook de WhatsApp.
 * Vector conocido: cuerpo + App Secret → firma esperada.
 */
describe('isValidSignature', () => {
  const APP_SECRET = 'test-app-secret';

  const rawBody = Buffer.from(
    JSON.stringify({ object: 'whatsapp_business_account', entry: [] }),
  );
  const sign = (body: Buffer, secret: string): string =>
    'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
  const validSignature = sign(rawBody, APP_SECRET);

  it('acepta una firma correcta', () => {
    expect(isValidSignature(rawBody, validSignature, APP_SECRET)).toBe(true);
  });

  it('rechaza una firma calculada con otro secreto', () => {
    const wrong = sign(rawBody, 'otro-secreto');
    expect(isValidSignature(rawBody, wrong, APP_SECRET)).toBe(false);
  });

  it('rechaza un cuerpo manipulado (misma firma)', () => {
    const tampered = Buffer.from(JSON.stringify({ object: 'evil' }));
    expect(isValidSignature(tampered, validSignature, APP_SECRET)).toBe(false);
  });

  it('rechaza un header sin el prefijo sha256= (malformado) sin lanzar', () => {
    const hexOnly = createHmac('sha256', APP_SECRET)
      .update(rawBody)
      .digest('hex');
    expect(isValidSignature(rawBody, hexOnly, APP_SECRET)).toBe(false);
  });

  it('rechaza un header ausente sin lanzar', () => {
    expect(isValidSignature(rawBody, undefined, APP_SECRET)).toBe(false);
  });

  it('rechaza un header con basura tras sha256= sin lanzar', () => {
    expect(isValidSignature(rawBody, 'sha256=not-hex', APP_SECRET)).toBe(false);
  });
});
