import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { DateTime } from 'luxon';
import { MessageAuthor, MessageDirection } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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
const FALLBACK_REPLY =
  'Ahora mismo no puedo terminar la gestión, aviso al equipo para que te atiendan en cuanto puedan. ¡Gracias por la paciencia!';

// --- Guardia contra confirmaciones fantasma (fix 3 post-T5) ---
// El modelo puede imitar confirmaciones del historial y afirmar "cita
// reservada" sin haber llamado a crear_cita. El backend sabe con certeza si
// crear_cita tuvo éxito EN ESTE TURNO (toolCalls): si el texto final pretende
// confirmar una reserva sin ese éxito, se inyecta UNA corrección; si el
// modelo persiste, se suprime el texto y sale este fallback honesto.

// Corrección interna del bucle: NO se persiste como Message (solo viaja en el
// array in-memory de la request; el único OUT que persiste webhook.service es
// el body final devuelto).
const PHANTOM_CORRECTION_MESSAGE =
  'AVISO DEL SISTEMA: No has llamado a crear_cita en este turno, así que la ' +
  'cita NO está creada. Llama a crear_cita ahora si el cliente ya confirmó ' +
  'explícitamente servicio, fecha y hora, o rectifica tu respuesta sin ' +
  'afirmar que hay una cita reservada.';

const PHANTOM_FALLBACK_REPLY =
  'No he podido completar la reserva ahora mismo, aviso al equipo para que ' +
  'te la confirmen. ¡Disculpa las molestias!';

// Heurística acotada (v1, aprobada): contexto de cita + afirmación perfectiva
// (participios / "he reservado"). La recapitulación legítima previa a la
// creación ("Te confirmo: …, ¿correcto?") usa presente de 1.ª persona y no
// dispara. Futuros/condicionales con participio ("quedará confirmada
// cuando…") SÍ disparan → degradan al fallback honesto: aceptado.
const BOOKING_CONTEXT_RE = /\b(cita|reserva)\b/i;
const CONFIRMATION_CLAIM_RE =
  /\b(reservad[ao]s?|confirmad[ao]s?|agendad[ao]s?|apuntad[ao]s?|cread[ao]s?)\b|\bhe(?:mos)?\s+(reservado|creado|agendado|apuntado|confirmado)\b/i;

/**
 * ¿El texto pretende confirmar una reserva? Pura y exportada para tests.
 * Falsos negativos posibles (frases exóticas): el prompt es la primera línea
 * de defensa; esta guardia es la red para el patrón observado.
 */
export function looksLikeBookingConfirmation(text: string): boolean {
  return BOOKING_CONTEXT_RE.test(text) && CONFIRMATION_CLAIM_RE.test(text);
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
};

export interface BotReply {
  body: string;
  metadata: BotReplyMetadata;
}

/**
 * BotEngine (H2 T4 + T5): genera la respuesta del bot con Claude Haiku a
 * partir de datos reales de BD, y desde T5 puede ACTUAR sobre la agenda vía
 * tool use (consultar_disponibilidad + crear_cita, ejecutadas server-side por
 * BotToolsService con el businessId de la conversación — el modelo jamás
 * elige el negocio).
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
      select: { name: true, timezone: true },
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

    // Fecha actual en zona negocio, con día de semana y año: el modelo no
    // tiene reloj y sin esto construye fechas con año pasado (fix post-T5).
    const today = DateTime.now()
      .setZone(business.timezone)
      .setLocale('es')
      .toFormat("cccc, d 'de' LLLL 'de' yyyy");

    const systemPrompt = buildBotSystemPrompt({
      businessName: business.name,
      timezone: business.timezone,
      today,
      services: services.map((s) => ({
        id: s.id,
        name: s.name,
        price: s.basePrice.toFixed(2),
        durationMinutes: s.durationMinutes,
      })),
      isFirstBotReply: previousBotReply === null,
    });

    return this.runToolLoop(systemPrompt, turns, {
      businessId,
      conversationId,
    });
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
  ): Promise<BotReply | null> {
    const messages: Anthropic.MessageParam[] = [...turns];
    const toolCalls: Array<{ name: string; ok: boolean }> = [];
    let inputTokens = 0;
    let outputTokens = 0;
    // Guardia anti-fantasma: una sola corrección por turno.
    let phantomCorrectionInjected = false;

    const metadata = (): BotReplyMetadata => ({
      inputTokens,
      outputTokens,
      model: BOT_MODEL,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    });

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
        // El SDK ya reintentó 429/5xx/red; si aun así falla → silencio.
        this.logger.error(
          `Claude call failed (iteration=${iteration}, ` +
            `conversationId=${context.conversationId}): ${String(error)}`,
        );
        return null;
      }

      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;

      if (response.stop_reason === 'refusal') {
        this.logger.warn(
          `Claude declined to answer (refusal, conversationId=${context.conversationId})`,
        );
        return null;
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
          this.logger.warn(
            `Claude returned empty text (conversationId=${context.conversationId})`,
          );
          return null;
        }

        // Guardia anti-fantasma: el texto pretende confirmar una reserva pero
        // crear_cita NO tuvo éxito en este turno → jamás se envía tal cual.
        const createdOkThisTurn = toolCalls.some(
          (t) => t.name === 'crear_cita' && t.ok,
        );
        if (looksLikeBookingConfirmation(body) && !createdOkThisTurn) {
          if (
            !phantomCorrectionInjected &&
            iteration + 1 < MAX_TOOL_ITERATIONS
          ) {
            phantomCorrectionInjected = true;
            this.logger.warn(
              `Phantom booking confirmation intercepted; injecting correction ` +
                `(conversationId=${context.conversationId})`,
            );
            // Corrección interna: solo vive en el array in-memory del bucle,
            // nunca se persiste como Message.
            messages.push({ role: 'assistant', content: response.content });
            messages.push({
              role: 'user',
              content: PHANTOM_CORRECTION_MESSAGE,
            });
            continue;
          }
          this.logger.error(
            `Phantom booking confirmation SUPPRESSED ` +
              `(conversationId=${context.conversationId}): "${body}"`,
          );
          return {
            body: PHANTOM_FALLBACK_REPLY,
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
        results.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(outcome.result),
        });
      }
      messages.push({ role: 'user', content: results });
    }

    // Tope alcanzado: log + respuesta de fallback (el cliente no se queda
    // colgado a mitad de gestión).
    this.logger.warn(
      `Tool loop hit MAX_TOOL_ITERATIONS=${MAX_TOOL_ITERATIONS} ` +
        `(conversationId=${context.conversationId}, ` +
        `toolCalls=${toolCalls.map((t) => t.name).join(',')})`,
    );
    return { body: FALLBACK_REPLY, metadata: metadata() };
  }
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
