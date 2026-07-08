import {
  buildBotSystemPrompt,
  type BotPromptInput,
} from './bot-prompt.builder';

// Tests del builder del system prompt (T4 + T5 + T6). Lo que se protege: los
// datos reales del negocio entran tal cual (services con id para las tools,
// timezone), la identificación IA solo aparece en la primera respuesta, los
// flujos de reserva/cancelación/reprogramación con confirmación explícita
// están, el escalado obliga a la tool (nada de "aviso al equipo" verbal), las
// reglas viejas de T4/T5 ("cancelar → aviso al equipo") ya NO están, y con
// services vacíos el prompt lo declara sin listar nada.

const SERVICE_ID_1 = 's0000000-0000-0000-0000-000000000001';
const SERVICE_ID_2 = 's0000000-0000-0000-0000-000000000002';

function makeInput(overrides: Partial<BotPromptInput> = {}): BotPromptInput {
  return {
    businessName: 'Fruteria Javier',
    timezone: 'Europe/Madrid',
    now: 'martes, 7 de julio de 2026 a las 23:34',
    scheduleSummary:
      'lunes a viernes: 9:00-14:00 y 16:00-20:00; sábado: 9:00-14:00; domingo: cerrado',
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

  it('incluye la fecha Y HORA actual, con año, e instruye a no deducir la hora del historial (fix reloj + post-T5)', () => {
    const prompt = buildBotSystemPrompt(makeInput());

    expect(prompt).toContain('Ahora es martes, 7 de julio de 2026 a las 23:34');
    expect(prompt).toContain('SIEMPRE con este año');
    expect(prompt).toContain(
      'Usa SIEMPRE esta hora del sistema para juzgar si un momento ya pasó o cuánto falta',
    );
    expect(prompt).toContain(
      'NUNCA deduzcas la hora del historial de mensajes',
    );
    expect(prompt).toContain('Nunca preguntes al cliente qué día es hoy');
  });

  it('incluye el resumen del horario cuando existe (para decir "cerramos" sin gastar tool)', () => {
    const prompt = buildBotSystemPrompt(makeInput());

    expect(prompt).toContain(
      'Horario del negocio: lunes a viernes: 9:00-14:00 y 16:00-20:00; sábado: 9:00-14:00; domingo: cerrado',
    );
  });

  it('omite la línea de horario cuando no hay horario configurado (no inventa)', () => {
    const prompt = buildBotSystemPrompt(
      makeInput({ scheduleSummary: undefined }),
    );

    expect(prompt).not.toContain('Horario del negocio');
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

  it('T6: las reglas viejas de "cancelar → aviso al equipo" YA NO están', () => {
    const prompt = buildBotSystemPrompt(makeInput());

    expect(prompt).not.toContain('eso aún no puedes hacerlo tú');
    expect(prompt).not.toContain('avisas al equipo para que lo gestionen');
    expect(prompt).not.toContain('aviso al equipo para que te contesten');
    expect(prompt).not.toContain(
      'di que avisas al equipo para que le atiendan',
    );
  });

  it('incluye la regla de solo-precios-de-la-lista sin promesa verbal de aviso', () => {
    const prompt = buildBotSystemPrompt(makeInput());

    expect(prompt).toContain(
      'PROHIBIDO inventar, estimar o redondear precios o servicios',
    );
    expect(prompt).toContain(
      'Nunca digas que avisas al equipo sin haber llamado a la herramienta',
    );
  });

  it('T6: contiene el flujo de citas existentes con identidad por teléfono y confirmación explícita', () => {
    const prompt = buildBotSystemPrompt(makeInput());

    expect(prompt).toContain('Tus citas: consultar, cancelar y reprogramar');
    expect(prompt).toContain('listar_mis_citas');
    expect(prompt).toContain('cancelar_cita');
    expect(prompt).toContain(
      'solo puedes ver y modificar las citas del teléfono de esta conversación',
    );
    expect(prompt).toContain(
      '"¿Cancelo tu Consulta del jueves 9 a las 13:00?"',
    );
    expect(prompt).toContain(
      'Jamás escribas que una cita queda cancelada sin el tool_result de éxito de este turno',
    );
  });

  it('FIX 2 post-T6: exige el appointmentId EXACTO (UUID), prohíbe el ordinal y obliga a re-listar si falta', () => {
    const prompt = buildBotSystemPrompt(makeInput());

    expect(prompt).toContain(
      'usa SIEMPRE el appointmentId EXACTO (el UUID largo)',
    );
    expect(prompt).toContain('JAMÁS uses el número de orden (1, 2, 3…)');
    expect(prompt).toContain(
      'Si no tienes el appointmentId de un listado de ESTA gestión, llama antes a listar_mis_citas',
    );
  });

  it('T6: la reprogramación es crear-antes-de-cancelar, con recapitulación doble y honestidad en fallos parciales', () => {
    const prompt = buildBotSystemPrompt(makeInput());

    expect(prompt).toContain(
      'es crear la nueva y DESPUÉS cancelar la vieja, en ese orden',
    );
    expect(prompt).toContain(
      '"Cambio tu cita del jueves 13:00 al viernes 10:00, ¿correcto?"',
    );
    expect(prompt).toContain('la cita original sigue intacta');
    expect(prompt).toContain(
      'el cliente tiene DOS citas: dilo honestamente y llama a escalar_a_humano',
    );
  });

  it('T6: el escalado lista los 5 motivos del 09 y prohíbe el aviso verbal sin tool', () => {
    const prompt = buildBotSystemPrompt(makeInput());

    expect(prompt).toContain('Escalado a una persona del equipo');
    for (const motivo of [
      'PIDE_HUMANO',
      'FRUSTRACION',
      'URGENCIA',
      'NO_PUEDO_RESOLVER',
      'FUERA_DE_SCOPE',
    ]) {
      expect(prompt).toContain(`motivo ${motivo}`);
    }
    expect(prompt).toContain(
      'SIN haber llamado a escalar_a_humano con éxito en este turno',
    );
    expect(prompt).toContain(
      '"Te paso con el equipo de Fruteria Javier; te responderán aquí mismo."',
    );
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
