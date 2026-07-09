import { sanitizeMessageMetadata } from './message-metadata.util';

describe('sanitizeMessageMetadata', () => {
  it('de una metadata COMPLETA del bot solo deja reminder + escalation.motivo', () => {
    // Todo lo que un OUT del bot escalado + recordatorio podría llevar junto.
    const full = {
      inputTokens: 1234,
      outputTokens: 567,
      model: 'claude-haiku-4-5',
      toolCalls: [
        { name: 'crear_cita', ok: true },
        { name: 'escalar_a_humano', ok: true },
      ],
      phantomGuard: 'corrected',
      appointmentId: 'a0000000-0000-0000-0000-000000000001',
      reminder: true,
      escalation: { motivo: 'PIDE_HUMANO' },
    };

    const result = sanitizeMessageMetadata(full);

    // Lo que SÍ sale.
    expect(result).toEqual({
      reminder: true,
      escalation: { motivo: 'PIDE_HUMANO' },
    });

    // Ausencia campo a campo de lo interno del sistema (assert explícito).
    expect(result).not.toHaveProperty('inputTokens');
    expect(result).not.toHaveProperty('outputTokens');
    expect(result).not.toHaveProperty('model');
    expect(result).not.toHaveProperty('toolCalls');
    expect(result).not.toHaveProperty('phantomGuard');
    expect(result).not.toHaveProperty('appointmentId');
    // Y que no se haya colado nada más allá de las 2 claves permitidas.
    expect(Object.keys(result ?? {}).sort()).toEqual([
      'escalation',
      'reminder',
    ]);
    // La escalation tampoco arrastra sub-campos extra.
    expect(Object.keys(result?.escalation ?? {})).toEqual(['motivo']);
  });

  it('devuelve null si no hay campos publicables', () => {
    expect(
      sanitizeMessageMetadata({ inputTokens: 10, model: 'x', toolCalls: [] }),
    ).toBeNull();
  });

  it('devuelve null ante metadata ausente o no-objeto', () => {
    expect(sanitizeMessageMetadata(null)).toBeNull();
    expect(sanitizeMessageMetadata(undefined)).toBeNull();
    expect(sanitizeMessageMetadata('reminder')).toBeNull();
  });

  it('ignora reminder no-true y escalation.motivo no-string', () => {
    expect(sanitizeMessageMetadata({ reminder: 'true' })).toBeNull();
    expect(sanitizeMessageMetadata({ reminder: false })).toBeNull();
    expect(sanitizeMessageMetadata({ escalation: { motivo: 123 } })).toBeNull();
    expect(sanitizeMessageMetadata({ escalation: null })).toBeNull();
  });

  it('deja solo reminder cuando no hay escalation', () => {
    expect(sanitizeMessageMetadata({ reminder: true, model: 'x' })).toEqual({
      reminder: true,
    });
  });
});
