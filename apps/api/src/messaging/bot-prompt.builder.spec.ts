import {
  buildBotSystemPrompt,
  type BotPromptInput,
} from './bot-prompt.builder';

// Tests del builder del system prompt (Tarea 4). Lo que se protege: los datos
// reales del negocio entran tal cual (services, timezone), la identificación
// IA solo aparece en la primera respuesta, la regla de no-citas está siempre,
// y con services vacíos el prompt lo declara sin listar nada.

function makeInput(overrides: Partial<BotPromptInput> = {}): BotPromptInput {
  return {
    businessName: 'Fruteria Javier',
    timezone: 'Europe/Madrid',
    services: [
      { name: 'Cesta de fruta', price: '25.00', durationMinutes: 30 },
      { name: 'Zumo natural', price: '4.50', durationMinutes: 15 },
    ],
    isFirstBotReply: false,
    ...overrides,
  };
}

describe('buildBotSystemPrompt', () => {
  it('incluye la identidad con el nombre del negocio y la regla de no decir que es humano', () => {
    const prompt = buildBotSystemPrompt(makeInput());

    expect(prompt).toContain('asistente automático');
    expect(prompt).toContain('Fruteria Javier');
    expect(prompt).toContain('Nunca digas ni insinúes que eres humano');
  });

  it('lista los services reales con nombre, precio y duración', () => {
    const prompt = buildBotSystemPrompt(makeInput());

    expect(prompt).toContain('- Cesta de fruta — 25.00 € — 30 min');
    expect(prompt).toContain('- Zumo natural — 4.50 € — 15 min');
  });

  it('incluye el timezone del negocio para referencias temporales', () => {
    const prompt = buildBotSystemPrompt(makeInput());

    expect(prompt).toContain('Europe/Madrid');
  });

  it('incluye la regla de identificación SOLO si es la primera respuesta del bot', () => {
    const first = buildBotSystemPrompt(makeInput({ isFirstBotReply: true }));
    const later = buildBotSystemPrompt(makeInput({ isFirstBotReply: false }));

    expect(first).toContain('Primer mensaje (obligatorio)');
    expect(first).toContain(
      '¡Hola! Soy el asistente automático de Fruteria Javier',
    );
    expect(later).not.toContain('Primer mensaje (obligatorio)');
  });

  it('incluye SIEMPRE la regla dura de no-citas (v0 no actúa sobre la agenda)', () => {
    for (const isFirstBotReply of [true, false]) {
      const prompt = buildBotSystemPrompt(makeInput({ isFirstBotReply }));

      expect(prompt).toContain(
        'NO puedes consultar disponibilidad ni crear, cancelar o reprogramar citas',
      );
      expect(prompt).toContain('el equipo te confirma en breve');
      expect(prompt).toContain(
        'PROHIBIDO proponer huecos, afirmar disponibilidad o confirmar/cancelar citas',
      );
    }
  });

  it('incluye la regla de solo-precios-de-la-lista y el fallback "aviso al equipo"', () => {
    const prompt = buildBotSystemPrompt(makeInput());

    expect(prompt).toContain(
      'PROHIBIDO inventar, estimar o redondear precios o servicios',
    );
    expect(prompt).toContain('aviso al equipo para que te contesten');
  });

  it('incluye la redirección de temas ajenos al negocio (uso auxiliar, política Meta)', () => {
    const prompt = buildBotSystemPrompt(makeInput());

    expect(prompt).toContain(
      'Solo puedo ayudarte con temas de Fruteria Javier: citas, horarios y servicios',
    );
  });

  it('con services vacíos: declara explícitamente que no hay servicios y no lista ninguno', () => {
    const prompt = buildBotSystemPrompt(makeInput({ services: [] }));

    expect(prompt).toContain('no tiene servicios configurados en el sistema');
    expect(prompt).toContain('No inventes servicios ni precios');
    // Ninguna línea de servicio ("- nombre — precio € — N min").
    expect(prompt).not.toMatch(/— \d+\.\d{2} € — \d+ min/);
  });

  it('el prompt solo contiene los datos del input (nada de otros negocios)', () => {
    const prompt = buildBotSystemPrompt(makeInput());

    // El builder es una función pura: todo dato de negocio del prompt procede
    // del input. Se comprueba que no hay placeholders sin resolver.
    expect(prompt).not.toContain('{');
    expect(prompt).not.toContain('undefined');
  });
});
