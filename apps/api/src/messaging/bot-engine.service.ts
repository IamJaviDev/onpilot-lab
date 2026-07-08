import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { DateTime } from 'luxon';
import { MessageAuthor, MessageDirection } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  formatScheduleSummary,
  parseWeeklySchedule,
} from './availability.util';
import { buildBotSystemPrompt } from './bot-prompt.builder';
import { BOT_TOOL_DEFINITIONS, BotToolsService } from './bot-tools.service';

// Modelo del bot (docs/09: Claude Haiku — rápido, económico, suficiente para
// agenda y servicios). Constante única para poder cambiarlo en un sitio.
const BOT_MODEL = 'claude-haiku-4-5';

// Con tool use los turnos consumen más que en v0 (bloques tool_use + texto).
const MAX_TOKENS = 1000;

// Temperatura moderada-baja: bot informativo/operativo, no creativo.
const TEMPERATURE = 0.3;

// Últimos N mensajes de la conversación como contexto (docs/09: 10-15).
const HISTORY_LIMIT = 10;

// La generación puede tardar; más de 30s ya no tiene sentido para un chat.
const CLAUDE_TIMEOUT_MS = 30_000;

// Tope del bucle de tool use por mensaje entrante (protección de bucle
// infinito). Un flujo normal de reserva usa 2-3 iteraciones.
const MAX_TOOL_ITERATIONS = 5;

// Respuesta si se agota el tope: el cliente no se queda sin respuesta a
// mitad de una gestión (decisión aprobada: fallback fijo, no silencio).
// Desde T6 (opción A) este fallback ESCALA de verdad: promete equipo → la
// conversación pasa a PENDING_REVIEW.
const FALLBACK_REPLY =
  'Ahora mismo no puedo terminar la gestión, aviso al equipo para que te atiendan en cuanto puedan. ¡Gracias por la paciencia!';

// --- Guardia contra afirmaciones fantasma (fix 3 post-T5, extendida T6) ---
// El modelo puede afirmar "cita reservada", "cita cancelada/cambiada" o
// "aviso al equipo" sin haber llamado a la tool que lo respalda. El backend
// sabe con certeza qué tools tuvieron éxito EN ESTE TURNO (toolCalls): si el
// texto final pretende algo sin respaldo, se inyecta UNA corrección; si el
// modelo persiste, se suprime el texto y sale un fallback honesto que además
// (opción A aprobada en T6) escala DE VERDAD a PENDING_REVIEW: si se promete
// equipo, hay equipo.

export type PhantomClaim = 'booking' | 'cancellation' | 'escalation';

// Tool cuyo éxito en el turno respalda cada pretensión. La pretensión
// "cambiada" exige cancelar_cita ok: así las DOS mitades de una
// reprogramación fallida (crear falla / cancelar falla) quedan interceptadas.
const CLAIM_REQUIRED_TOOL: Record<PhantomClaim, string> = {
  booking: 'crear_cita',
  cancellation: 'cancelar_cita',
  escalation: 'escalar_a_humano',
};

// Correcciones internas del bucle: NO se persisten como Message (solo viajan
// en el array in-memory de la request; el único OUT que persiste
// webhook.service es el body final devuelto).
const CLAIM_CORRECTIONS: Record<PhantomClaim, string> = {
  booking:
    'No has llamado a crear_cita en este turno, así que la cita NO está ' +
    'creada. Llama a crear_cita ahora si el cliente ya confirmó ' +
    'explícitamente servicio, fecha y hora, o rectifica tu respuesta sin ' +
    'afirmar que hay una cita reservada.',
  cancellation:
    'No has llamado a cancelar_cita en este turno, así que la cita NO está ' +
    'cancelada ni cambiada. Llama a cancelar_cita ahora si el cliente ya ' +
    'confirmó explícitamente qué cita cancelar, o rectifica tu respuesta ' +
    'sin afirmar que la cita queda cancelada o cambiada.',
  escalation:
    'No has llamado a escalar_a_humano en este turno, así que el equipo NO ' +
    'está avisado. Llama a escalar_a_humano ahora si procede, o rectifica ' +
    'tu respuesta sin afirmar que avisas al equipo.',
};

// FIX 4 post-T6: crear_cita ok + cancelar_cita fallida en el mismo turno =
// el cliente tiene DOS citas. La honestidad no se delega en el modelo: todo
// texto fijo/fallback de ese estado usa esta variante (y escala de verdad).
const PARTIAL_RESCHEDULE_REPLY =
  'He creado tu cita nueva pero no he podido anular la anterior — te han ' +
  'quedado las dos; aviso al equipo para que lo corrijan.';

// Fallbacks honestos por tipo de pretensión suprimida. Todos prometen equipo
// y por eso todos van acompañados del escalado real (opción A).
const PHANTOM_FALLBACK_REPLIES: Record<PhantomClaim, string> = {
  booking:
    'No he podido completar la reserva ahora mismo, aviso al equipo para ' +
    'que te la confirmen. ¡Disculpa las molestias!',
  cancellation:
    'No he podido completar la gestión de tu cita ahora mismo, aviso al ' +
    'equipo para que lo revisen. ¡Disculpa las molestias!',
  escalation:
    'Aviso al equipo para que te atiendan en cuanto puedan; te responderán ' +
    'aquí mismo.',
};

// Heurística acotada (v1 aprobada en T5, extendida en T6): contexto de cita +
// afirmación perfectiva (participios / "he reservado/cancelado"), y para el
// escalado verbo de aviso + destinatario (equipo/persona/…) en la misma
// frase. Las frases interrogativas se descartan enteras antes de evaluar:
// una recapitulación ("¿Cancelo tu cita del jueves?") o una oferta ("¿Aviso
// al equipo?") no son afirmaciones. Futuros/condicionales con participio
// ("quedará confirmada cuando…") SÍ disparan → degradan al fallback honesto
// (que ahora escala de verdad): aceptado.
const BOOKING_CONTEXT_RE = /\b(cita|reserva)\b/i;
const BOOKING_CLAIM_RE =
  /\b(reservad[ao]s?|confirmad[ao]s?|agendad[ao]s?|apuntad[ao]s?|cread[ao]s?)\b|\bhe(?:mos)?\s+(reservado|creado|agendado|apuntado|confirmado)\b/i;
const CANCELLATION_CLAIM_RE =
  /\b(cancelad[ao]s?|anulad[ao]s?|reprogramad[ao]s?|movid[ao]s?|cambiad[ao]s?)\b|\bhe(?:mos)?\s+(cancelado|anulado|reprogramado|movido|cambiado)\b/i;

const ESCALATION_VERB =
  '(?:avis(?:o|ar[eé]|aremos|amos|ado|ando)|te\\s+paso|te\\s+pongo\\s+en\\s+contacto|he(?:mos)?\\s+(?:pasado|trasladado|derivado|escalado)|paso\\s+(?:tu|el|la)\\s+(?:consulta|mensaje|caso|petici[oó]n|duda))';
const ESCALATION_TARGET =
  '(?:equipo|compañer\\w+|personas?|humanos?|profesionales?)';
// Dos órdenes: "aviso al equipo" y "el equipo está avisado / te responderá".
const ESCALATION_CLAIM_RE = new RegExp(
  `\\b${ESCALATION_VERB}\\b[^.!?\\n]*\\b${ESCALATION_TARGET}\\b` +
    `|\\b${ESCALATION_TARGET}\\b[^.!?\\n]*\\b(?:avisad[ao]|al\\s+tanto|te\\s+responder|te\\s+atender|te\\s+contactar|te\\s+escribir)`,
  'i',
);

/** Descarta las frases que terminan en '?' (ofertas/recapitulaciones). */
function stripInterrogativeSentences(text: string): string {
  return text.replace(/[^.!?\n]*\?+/g, '');
}

/**
 * ¿Qué pretensiones afirma el texto? Pura y exportada para tests. Puede
 * devolver varias (una confirmación de reprogramación legítima afirma
 * reserva + cancelación, y exige AMBAS tools ok). Falsos negativos posibles
 * (frases exóticas): el prompt es la primera línea de defensa; esta guardia
 * es la red para los patrones observados.
 */
export function detectPhantomClaims(text: string): PhantomClaim[] {
  const assertive = stripInterrogativeSentences(text);
  const claims: PhantomClaim[] = [];
  const bookingContext = BOOKING_CONTEXT_RE.test(assertive);
  if (bookingContext && BOOKING_CLAIM_RE.test(assertive)) {
    claims.push('booking');
  }
  if (bookingContext && CANCELLATION_CLAIM_RE.test(assertive)) {
    claims.push('cancellation');
  }
  if (ESCALATION_CLAIM_RE.test(assertive)) {
    claims.push('escalation');
  }
  return claims;
}

/**
 * Metadata de coste/auditoría que se persiste en Message.metadata (Json) de
 * cada OUT del bot. Tokens ACUMULADOS de todas las iteraciones del bucle;
 * toolCalls registra qué herramientas ejecutó el bot y si fueron bien (09:
 * logs y auditoría). Type alias (no interface) a propósito: así es asignable
 * a Prisma.InputJsonValue.
 */
export type BotReplyMetadata = {
  inputTokens: number;
  outputTokens: number;
  model: string;
  toolCalls?: Array<{ name: string; ok: boolean }>;
  // Auditoría de la guardia anti-fantasma: 'corrected' = se inyectó la
  // corrección y el turno acabó bien; 'suppressed' = texto suprimido y
  // sustituido por el fallback seguro.
  phantomGuard?: 'corrected' | 'suppressed';
  // Auditoría de escalado (docs/09: motivo de escalado): presente si la
  // conversación pasó a PENDING_REVIEW en este turno, sea por la tool
  // escalar_a_humano (su motivo) o por un fallback que promete equipo
  // (opción A: NO_PUEDO_RESOLVER).
  escalation?: { motivo: string };
};

export interface BotReply {
  body: string;
  metadata: BotReplyMetadata;
}

/**
 * BotEngine (H2 T4 + T5 + T6): genera la respuesta del bot con Claude Haiku a
 * partir de datos reales de BD, y puede ACTUAR vía tool use: agenda
 * (consultar_disponibilidad, crear_cita, listar_mis_citas, cancelar_cita) y
 * escalado real a humano (escalar_a_humano → PENDING_REVIEW). Todas las
 * tools se ejecutan server-side por BotToolsService con el businessId de la
 * conversación — el modelo jamás elige el negocio ni el cliente.
 *
 * Solo LEE de BD y genera texto: no llama al adapter de WhatsApp ni persiste
 * mensajes — la orquestación (generar → enviar → persistir) vive en
 * webhook.service, mismo patrón de separación que T3/T4.
 *
 * Cliente: SDK oficial @anthropic-ai/sdk (decisión T5): el bucle multi-turno
 * de tools multiplica las llamadas por mensaje y el SDK aporta retries
 * automáticos en 429/5xx, tipos del wire format y timeout nativo. Bucle
 * MANUAL con tope de iteraciones (no el tool runner beta): control fino.
 */
@Injectable()
export class BotEngineService {
  private readonly logger = new Logger(BotEngineService.name);
  private client: Anthropic | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly botTools: BotToolsService,
  ) {}

  // Lazy: la API key es obligatoria (fail-fast en env.validation), pero el
  // cliente solo se construye si el bot llega a usarse.
  private getClient(): Anthropic {
    this.client ??= new Anthropic({
      apiKey: this.config.getOrThrow<string>('ANTHROPIC_API_KEY'),
      timeout: CLAUDE_TIMEOUT_MS,
      // maxRetries default del SDK (2) con backoff en 429/5xx/red.
    });
    return this.client;
  }

  /**
   * Genera el texto de respuesta para el último mensaje de la conversación
   * (el IN ya está persistido, así que viaja dentro del historial).
   *
   * @returns la respuesta con metadata de tokens/tools, o `null` si decide no
   *   responder (negocio no encontrado, historial vacío, fallo de Claude,
   *   respuesta vacía o refusal). Ante `null` el llamante no envía nada:
   *   mejor silencio que error raro. Los fallos de Claude se capturan aquí
   *   con log claro; no se propagan.
   */
  async generateReply(input: {
    businessId: string;
    conversationId: string;
  }): Promise<BotReply | null> {
    const { businessId, conversationId } = input;

    // Todo filtrado por businessId: el prompt JAMÁS puede contener datos de
    // otro negocio (regla multi-tenant + docs/09 "datos que no debe recibir").
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, deletedAt: null },
      select: { name: true, timezone: true, weeklySchedule: true },
    });
    if (!business) {
      this.logger.warn(
        `Bot reply skipped: business not found (businessId=${businessId})`,
      );
      return null;
    }

    const services = await this.prisma.service.findMany({
      where: { businessId, isActive: true, deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, basePrice: true, durationMinutes: true },
    });

    // Identificación proactiva (Art. 50): si la conversación no tiene ningún
    // OUT del BOT, esta es la primera respuesta y debe abrirse identificándose.
    // Query aparte del historial: un OUT previo puede quedar fuera de la
    // ventana de HISTORY_LIMIT.
    const previousBotReply = await this.prisma.message.findFirst({
      where: {
        businessId,
        conversationId,
        direction: MessageDirection.OUT,
        author: MessageAuthor.BOT,
        deletedAt: null,
      },
      select: { id: true },
    });

    const history = await this.prisma.message.findMany({
      where: { businessId, conversationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      select: { direction: true, body: true },
    });

    const turns = mapHistoryToTurns(history.reverse());
    if (turns.length === 0) {
      this.logger.warn(
        `Bot reply skipped: no usable history (conversationId=${conversationId})`,
      );
      return null;
    }

    // Fecha Y HORA actual en zona negocio: el modelo no tiene reloj. Sin la
    // fecha construía años pasados (fix post-T5); sin la hora alucinaba la
    // hora del día desde el historial ("son casi las 19:30" a las 23:34) y
    // razonaba mal sobre "ya pasó" / "en 10 min" (fix del reloj).
    const now = DateTime.now()
      .setZone(business.timezone)
      .setLocale('es')
      .toFormat("cccc, d 'de' LLLL 'de' yyyy 'a las' HH:mm");

    // Resumen del horario para el prompt: el bot debe poder decir "los
    // domingos cerramos" sin gastar una tool, y no juzgar por su cuenta si una
    // hora es plausible. Sin horario configurado → sin línea (no inventar).
    const schedule = parseWeeklySchedule(business.weeklySchedule);
    const scheduleSummary = schedule
      ? formatScheduleSummary(schedule)
      : undefined;

    const systemPrompt = buildBotSystemPrompt({
      businessName: business.name,
      timezone: business.timezone,
      now,
      scheduleSummary,
      services: services.map((s) => ({
        id: s.id,
        name: s.name,
        price: s.basePrice.toFixed(2),
        durationMinutes: s.durationMinutes,
      })),
      isFirstBotReply: previousBotReply === null,
    });

    return this.runToolLoop(
      systemPrompt,
      turns,
      { businessId, conversationId },
      business.name,
    );
  }

  /**
   * Bucle manual de tool use: request → si el modelo pide tools, ejecutarlas
   * server-side y devolver tool_results → repetir hasta texto final o tope.
   * Stateless frente a la API: todo el contexto viaja en cada request.
   */
  private async runToolLoop(
    systemPrompt: string,
    turns: Anthropic.MessageParam[],
    context: { businessId: string; conversationId: string },
    businessName: string,
  ): Promise<BotReply | null> {
    const messages: Anthropic.MessageParam[] = [...turns];
    const toolCalls: Array<{ name: string; ok: boolean }> = [];
    let inputTokens = 0;
    let outputTokens = 0;
    // Guardia anti-fantasma: una sola corrección por turno.
    let phantomCorrectionInjected = false;
    // Motivo de escalado del turno (tool escalar_a_humano ok o fallback con
    // escalado real de la opción A) para la metadata de auditoría.
    let escalationMotivo: string | null = null;
    // FIX 1/4 post-T6: efectos reales del turno. Con ellos el engine puede
    // componer un texto determinista si el modelo calla o miente sobre el
    // estado: una acción CON EFECTO jamás acaba en silencio.
    let crearOk = false;
    let crearResult: Record<string, unknown> | null = null;
    let cancelarOk = false;
    let cancelarResult: Record<string, unknown> | null = null;
    let cancelarFailed = false;
    let escaladoOk = false;

    const metadata = (): BotReplyMetadata => ({
      inputTokens,
      outputTokens,
      model: BOT_MODEL,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      ...(escalationMotivo ? { escalation: { motivo: escalationMotivo } } : {}),
    });

    // FIX 4: crear ok + cancelar fallida (y sin cancelar ok) = dos citas.
    const isPartialReschedule = (): boolean =>
      crearOk && cancelarFailed && !cancelarOk;

    // Opción A (T6): todo fallback que promete "aviso al equipo" escala de
    // verdad — la conversación queda en PENDING_REVIEW (única ruta de
    // escritura: BotToolsService). Si la transición falla, se loguea y el
    // fallback sale igualmente (peor un aviso sin escalado que el silencio).
    const escalateForFallback = async (): Promise<void> => {
      // Si escalar_a_humano ya escaló en este turno, no repetir la escritura
      // ni machacar el motivo real con NO_PUEDO_RESOLVER.
      if (escalationMotivo) return;
      const escalated = await this.botTools.transitionToPendingReview(context);
      if (escalated) {
        escalationMotivo = 'NO_PUEDO_RESOLVER';
      } else {
        this.logger.error(
          `Fallback escalation to PENDING_REVIEW failed ` +
            `(conversationId=${context.conversationId})`,
        );
      }
    };

    // FIX 1 post-T6: respuesta determinista cuando el modelo calla (texto
    // vacío, refusal o fallo del SDK) DESPUÉS de una tool con efecto. El
    // texto se compone desde los tool_results reales del turno; sin efectos,
    // devuelve null y aplica el "mejor silencio que error raro" de T4.
    const replyForSilence = async (): Promise<BotReply | null> => {
      if (isPartialReschedule()) {
        await escalateForFallback();
        return { body: PARTIAL_RESCHEDULE_REPLY, metadata: metadata() };
      }
      const parts: string[] = [];
      const nueva = citaLabel(crearResult);
      const anulada = citaLabel(cancelarResult);
      if (crearOk && cancelarOk) {
        parts.push(
          nueva
            ? `¡Hecho! Tu cita queda cambiada a ${nueva}; la anterior queda cancelada.`
            : '¡Hecho! El cambio de tu cita queda confirmado; la anterior queda cancelada.',
        );
      } else if (crearOk) {
        parts.push(
          nueva
            ? `¡Hecho! Tu cita queda confirmada: ${nueva}.`
            : '¡Hecho! Tu cita queda confirmada.',
        );
      } else if (cancelarOk) {
        parts.push(
          anulada
            ? `Hecho: tu cita de ${anulada} queda cancelada.`
            : 'Hecho: tu cita queda cancelada.',
        );
      }
      if (escaladoOk) {
        parts.push(
          `Te paso con el equipo de ${businessName}; te responderán aquí mismo.`,
        );
      }
      if (parts.length === 0) return null;
      this.logger.warn(
        `Model went silent after effectful tool(s); using fixed reply ` +
          `(conversationId=${context.conversationId}, ` +
          `toolCalls=${toolCalls.map((t) => t.name).join(',')})`,
      );
      return { body: parts.join(' '), metadata: metadata() };
    };

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      let response: Anthropic.Message;
      try {
        response = await this.getClient().messages.create({
          model: BOT_MODEL,
          max_tokens: MAX_TOKENS,
          temperature: TEMPERATURE,
          system: systemPrompt,
          tools: BOT_TOOL_DEFINITIONS,
          messages,
        });
      } catch (error) {
        // El SDK ya reintentó 429/5xx/red; si aun así falla → silencio,
        // SALVO que en el turno ya haya una tool con efecto (FIX 1).
        this.logger.error(
          `Claude call failed (iteration=${iteration}, ` +
            `conversationId=${context.conversationId}): ${String(error)}`,
        );
        return replyForSilence();
      }

      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;

      if (response.stop_reason === 'refusal') {
        this.logger.warn(
          `Claude declined to answer (refusal, conversationId=${context.conversationId})`,
        );
        return replyForSilence();
      }

      const toolUses = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );

      if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
        const body = response.content
          .filter(
            (block): block is Anthropic.TextBlock => block.type === 'text',
          )
          .map((block) => block.text)
          .join('')
          .trim();

        if (!body) {
          // FIX 1 post-T6 (escalado silencioso del log 23:52): tras una tool
          // con efecto, el "vacío → null → silencio" de T4 se tragaba la
          // despedida/confirmación. Con efecto → texto fijo; sin efecto →
          // null como siempre.
          const recovered = await replyForSilence();
          if (recovered) return recovered;
          this.logger.warn(
            `Claude returned empty text (conversationId=${context.conversationId})`,
          );
          return null;
        }

        // Guardia anti-fantasma: el texto pretende reserva / cancelación /
        // escalado sin que la tool correspondiente haya tenido éxito en este
        // turno → jamás se envía tal cual.
        const unbacked = detectPhantomClaims(body).filter(
          (claim) =>
            !toolCalls.some(
              (t) => t.name === CLAIM_REQUIRED_TOOL[claim] && t.ok,
            ),
        );
        if (unbacked.length > 0) {
          if (
            !phantomCorrectionInjected &&
            iteration + 1 < MAX_TOOL_ITERATIONS
          ) {
            phantomCorrectionInjected = true;
            this.logger.warn(
              `Phantom claim(s) intercepted [${unbacked.join(',')}]; ` +
                `injecting correction (conversationId=${context.conversationId})`,
            );
            // Corrección interna: solo vive en el array in-memory del bucle,
            // nunca se persiste como Message.
            messages.push({ role: 'assistant', content: response.content });
            messages.push({
              role: 'user',
              content:
                'AVISO DEL SISTEMA: ' +
                unbacked.map((claim) => CLAIM_CORRECTIONS[claim]).join(' '),
            });
            continue;
          }
          this.logger.error(
            `Phantom claim(s) SUPPRESSED [${unbacked.join(',')}] ` +
              `(conversationId=${context.conversationId}): "${body}"`,
          );
          await escalateForFallback();
          return {
            // FIX 4: si hay una reprogramación a medias, el fallback debe
            // contar el duplicado — no el mensaje genérico de escalado.
            body: isPartialReschedule()
              ? PARTIAL_RESCHEDULE_REPLY
              : PHANTOM_FALLBACK_REPLIES[unbacked[0]],
            metadata: { ...metadata(), phantomGuard: 'suppressed' },
          };
        }

        return {
          body,
          metadata: {
            ...metadata(),
            ...(phantomCorrectionInjected
              ? { phantomGuard: 'corrected' as const }
              : {}),
          },
        };
      }

      // Turno del asistente completo (texto + tool_use) y luego TODOS los
      // tool_results en UN solo mensaje user (requisito de la API).
      messages.push({ role: 'assistant', content: response.content });

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        const outcome = await this.botTools.execute(
          context,
          toolUse.name,
          toolUse.input,
        );
        toolCalls.push({ name: toolUse.name, ok: outcome.ok });
        // Efectos del turno (FIX 1/4) + auditoría de escalado: el motivo (ya
        // validado por la tool) va a la metadata del Message OUT (docs/09).
        if (outcome.ok) {
          switch (toolUse.name) {
            case 'crear_cita':
              crearOk = true;
              crearResult = outcome.result;
              break;
            case 'cancelar_cita':
              cancelarOk = true;
              cancelarResult = outcome.result;
              break;
            case 'escalar_a_humano': {
              escaladoOk = true;
              const input = toolUse.input as { motivo?: string };
              escalationMotivo = input?.motivo ?? 'NO_PUEDO_RESOLVER';
              break;
            }
          }
        } else if (toolUse.name === 'cancelar_cita') {
          cancelarFailed = true;
        }
        results.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(outcome.result),
        });
      }
      messages.push({ role: 'user', content: results });
    }

    // Tope alcanzado: log + respuesta de fallback (el cliente no se queda
    // colgado a mitad de gestión). Promete equipo → escalado real (opción A).
    this.logger.warn(
      `Tool loop hit MAX_TOOL_ITERATIONS=${MAX_TOOL_ITERATIONS} ` +
        `(conversationId=${context.conversationId}, ` +
        `toolCalls=${toolCalls.map((t) => t.name).join(',')})`,
    );
    await escalateForFallback();
    return {
      body: isPartialReschedule() ? PARTIAL_RESCHEDULE_REPLY : FALLBACK_REPLY,
      metadata: metadata(),
    };
  }
}

/**
 * Etiqueta legible de la cita de un tool_result de crear_cita/cancelar_cita
 * ({ cita: { servicio, fecha, hora } }), para los textos fijos del FIX 1.
 * Defensivo: si el shape no es el esperado, null (el texto fijo sale sin
 * detalle, pero sale).
 */
function citaLabel(result: Record<string, unknown> | null): string | null {
  const cita = result?.cita as
    | { servicio?: unknown; fecha?: unknown; hora?: unknown }
    | undefined;
  if (
    !cita ||
    typeof cita.servicio !== 'string' ||
    typeof cita.fecha !== 'string' ||
    typeof cita.hora !== 'string'
  ) {
    return null;
  }
  return `${cita.servicio} el ${cita.fecha} a las ${cita.hora}`;
}

/**
 * Mapea el historial (ya en orden cronológico) a turnos de la API: IN → user,
 * OUT → assistant. La API exige que el primer turno sea `user`: si el recorte
 * de HISTORY_LIMIT dejó OUTs al principio, se descartan. Turnos consecutivos
 * del mismo rol son válidos (la API los combina).
 *
 * Exportada para testearla directamente.
 */
export function mapHistoryToTurns(
  history: Array<{ direction: MessageDirection; body: string }>,
): Anthropic.MessageParam[] {
  const turns: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.direction === MessageDirection.IN ? 'user' : 'assistant',
    content: m.body,
  }));

  const firstUser = turns.findIndex((t) => t.role === 'user');
  return firstUser === -1 ? [] : turns.slice(firstUser);
}
