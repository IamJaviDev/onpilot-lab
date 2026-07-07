import {
  buildBotSystemPrompt,
  type BotPromptInput,
} from './bot-prompt.builder';

// Tests del builder del system prompt (T4 + T5). Lo que se protege: los datos
// reales del negocio entran tal cual (services con id para las tools,
// timezone), la identificación IA solo aparece en la primera respuesta, el
// flujo de reserva con confirmación explícita está y la regla dura de
// no-citas de la T4 ya NO está, y con services vacíos el prompt lo declara
// sin listar nada.

const SERVICE_ID_1 = 's0000000-0000-0000-0000-000000000001';
const SERVICE_ID_2 = 's0000000-0000-0000-0000-000000000002';

function makeInput(overrides: Partial<BotPromptInput> = {}): BotPromptInput {
  return {
    businessName: 'Fruteria Javier',
    timezone: 'Europe/Madrid',
    today: 'martes, 7 de julio de 2026',
    services: [
      {
        id: SERVICE_ID_1,
        name: 'Cesta de fruta',
        price: '25.00',
        durationMinutes: 30,
      },
      {
        id: SERVICE_ID_2,
        name: 'Zumo natural',
        price: '4.50',
        durationMinutes: 15,
      },
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

  it('lista los services reales con nombre, precio, duración y el id para las tools', () => {
    const prompt = buildBotSystemPrompt(makeInput());

    expect(prompt).toContain(
      `- Cesta de fruta — 25.00 € — 30 min — id: ${SERVICE_ID_1}`,
    );
    expect(prompt).toContain(
      `- Zumo natural — 4.50 € — 15 min — id: ${SERVICE_ID_2}`,
    );
  });

  it('incluye el timezone del negocio para referencias temporales', () => {
    const prompt = buildBotSystemPrompt(makeInput());

    expect(prompt).toContain('Europe/Madrid');
  });

  it('incluye la fecha actual con año y prohíbe preguntar qué día es (fix post-T5)', () => {
    const prompt = buildBotSystemPrompt(makeInput());

    expect(prompt).toContain('Hoy es martes, 7 de julio de 2026');
    expect(prompt).toContain('SIEMPRE con este año');
    expect(prompt).toContain('Nunca preguntes al cliente qué día es hoy');
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

  it('T5: contiene el flujo de reserva con las dos tools y la confirmación explícita', () => {
    const prompt = buildBotSystemPrompt(makeInput());

    expect(prompt).toContain('Reserva de citas (flujo obligatorio)');
    expect(prompt).toContain('consultar_disponibilidad');
    expect(prompt).toContain('crear_cita');
    expect(prompt).toContain('confirmación explícita');
    expect(prompt).toContain(
      'Un "vale" ambiguo a una lista de opciones NO es confirmación',
    );
  });

  it('fix 2 post-T5: contiene la regla de caducidad de disponibilidad y la de usar diaSemana de la tool', () => {
    const prompt = buildBotSystemPrompt(makeInput());

    expect(prompt).toContain(
      'La disponibilidad cambia constantemente y CADUCA',
    );
    expect(prompt).toContain(
      'aunque la hayas consultado antes o creas recordarla del historial',
    );
    expect(prompt).toContain(
      'Nunca afirmes disponibilidad (ni positiva ni negativa) sin un tool_result de este turno',
    );
    expect(prompt).toContain(
      'usa el diaSemana que devuelve la herramienta — no lo calcules tú',
    );
  });

  it('fix 3 post-T5: contiene la regla anti-fantasma (cada cita exige su crear_cita en este turno)', () => {
    const prompt = buildBotSystemPrompt(makeInput());

    expect(prompt).toContain('La ÚNICA forma de reservar es crear_cita');
    expect(prompt).toContain('pertenecen a OTRAS citas ya gestionadas');
    expect(prompt).toContain(
      'cada nueva cita exige su propia llamada a crear_cita EN ESTE TURNO',
    );
    expect(prompt).toContain(
      'Jamás escribas que una cita queda reservada o confirmada sin el tool_result de éxito de este turno',
    );
  });

  it('T5: contiene las prohibiciones de reserva (no inventar huecos, no crear sin confirmar, no confirmar sin éxito)', () => {
    const prompt = buildBotSystemPrompt(makeInput());

    expect(prompt).toContain(
      'Proponer o insinuar horas que no haya devuelto consultar_disponibilidad',
    );
    // Fix 4 (propina): el día cerrado se comunica como cerrado, no como
    // "no tengo información".
    expect(prompt).toContain('"ese día estamos cerrados"');
    expect(prompt).toContain(
      'Llamar a crear_cita sin la confirmación explícita',
    );
    expect(prompt).toContain(
      'Decir que la cita está reservada si crear_cita no ha devuelto éxito',
    );
  });

  it('T5: la regla dura de no-citas de la T4 YA NO está', () => {
    const prompt = buildBotSystemPrompt(makeInput());

    expect(prompt).not.toContain(
      'NO puedes consultar disponibilidad ni crear, cancelar o reprogramar citas',
    );
    expect(prompt).not.toContain('Te apunto la petición');
  });

  it('cancelar/reprogramar siguen fuera: aviso al equipo (hasta T6)', () => {
    const prompt = buildBotSystemPrompt(makeInput());

    expect(prompt).toContain('Cancelar o cambiar una cita existente');
    expect(prompt).toContain('avisas al equipo para que lo gestionen');
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
    // Ninguna línea de servicio ("- nombre — precio € — N min — id: …").
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
