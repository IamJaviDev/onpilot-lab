import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageAuthor, MessageDirection } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildBotSystemPrompt } from './bot-prompt.builder';

// Modelo del bot (docs/09: Claude Haiku — rápido, económico, suficiente para
// agenda y servicios). Constante única para poder cambiarlo en un sitio.
const BOT_MODEL = 'claude-haiku-4-5';

// Las respuestas de WhatsApp son cortas: 500 tokens sobran y acotan el coste.
const MAX_TOKENS = 500;

// Temperatura moderada-baja: bot informativo, no creativo.
const TEMPERATURE = 0.3;

// Últimos N mensajes de la conversación como contexto (docs/09: 10-15).
// contextSummary para conversaciones largas queda para futuro, no en v0.
const HISTORY_LIMIT = 10;

// La generación puede tardar; más de 30s ya no tiene sentido para un chat.
const CLAUDE_TIMEOUT_MS = 30_000;

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Metadata de coste que se persiste en Message.metadata (Json) de cada OUT del
 * bot: medir tokens desde el día 1 (doc de feature H2). Type alias (no
 * interface) a propósito: así es asignable a Prisma.InputJsonValue.
 */
export type BotReplyMetadata = {
  inputTokens: number;
  outputTokens: number;
  model: string;
};

export interface BotReply {
  body: string;
  metadata: BotReplyMetadata;
}

// Lo mínimo que se navega de la respuesta de /v1/messages (éxito y error).
interface AnthropicMessagesResponse {
  content?: Array<{ type: string; text?: string }>;
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { type?: string; message?: string };
}

type ConversationTurn = { role: 'user' | 'assistant'; content: string };

/**
 * BotEngine v0 (Tarea 4): genera la respuesta del bot con Claude Haiku a
 * partir de datos reales de BD (Business + Services + historial). Habla, no
 * actúa: cero acciones de agenda, cero transiciones de estado.
 *
 * Solo LEE de BD y genera texto: no llama al adapter ni persiste — la
 * orquestación (generar → enviar → persistir) vive en webhook.service, mismo
 * patrón de separación que la Tarea 3.
 *
 * Cliente: fetch nativo (coherente con WhatsAppAdapter). Sin reintentos por
 * diseño en v0; SDK oficial se reevalúa cuando llegue tool use (T5).
 */
@Injectable()
export class BotEngineService {
  private readonly logger = new Logger(BotEngineService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Genera el texto de respuesta para el último mensaje de la conversación
   * (el IN ya está persistido, así que viaja dentro del historial).
   *
   * @returns la respuesta con metadata de tokens, o `null` si decide no
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
      select: { name: true, basePrice: true, durationMinutes: true },
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

    const systemPrompt = buildBotSystemPrompt({
      businessName: business.name,
      timezone: business.timezone,
      services: services.map((s) => ({
        name: s.name,
        price: s.basePrice.toFixed(2),
        durationMinutes: s.durationMinutes,
      })),
      isFirstBotReply: previousBotReply === null,
    });

    return this.callClaude(systemPrompt, turns, conversationId);
  }

  /**
   * Llamada stateless a /v1/messages: todo el contexto viaja en cada request.
   * Cualquier fallo (red, timeout, 429, 5xx, respuesta rara) → log claro y
   * `null`; el manejo fino de reintentos/mensaje de cortesía es futuro.
   */
  private async callClaude(
    systemPrompt: string,
    turns: ConversationTurn[],
    conversationId: string,
  ): Promise<BotReply | null> {
    const apiKey = this.config.getOrThrow<string>('ANTHROPIC_API_KEY');

    let response: Response;
    try {
      response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: BOT_MODEL,
          max_tokens: MAX_TOKENS,
          temperature: TEMPERATURE,
          system: systemPrompt,
          messages: turns,
        }),
        signal: AbortSignal.timeout(CLAUDE_TIMEOUT_MS),
      });
    } catch (error) {
      // Red caída, DNS, timeout… Anthropic no llegó a responder.
      this.logger.error(
        `Claude call failed before reaching Anthropic (network/timeout, ` +
          `conversationId=${conversationId}): ${String(error)}`,
      );
      return null;
    }

    const payload = (await response.json().catch(() => undefined)) as
      | AnthropicMessagesResponse
      | undefined;

    if (!response.ok) {
      this.logger.error(
        `Claude call rejected (HTTP ${response.status}, ` +
          `type=${payload?.error?.type ?? '?'}, ` +
          `conversationId=${conversationId}): ` +
          `${payload?.error?.message ?? '(no error body)'}`,
      );
      return null;
    }

    if (payload?.stop_reason === 'refusal') {
      this.logger.warn(
        `Claude declined to answer (refusal, conversationId=${conversationId})`,
      );
      return null;
    }

    const body = (payload?.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('')
      .trim();

    if (!body) {
      this.logger.warn(
        `Claude returned empty text (conversationId=${conversationId})`,
      );
      return null;
    }

    return {
      body,
      metadata: {
        inputTokens: payload?.usage?.input_tokens ?? 0,
        outputTokens: payload?.usage?.output_tokens ?? 0,
        model: BOT_MODEL,
      },
    };
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
): ConversationTurn[] {
  const turns: ConversationTurn[] = history.map((m) => ({
    role: m.direction === MessageDirection.IN ? 'user' : 'assistant',
    content: m.body,
  }));

  const firstUser = turns.findIndex((t) => t.role === 'user');
  return firstUser === -1 ? [] : turns.slice(firstUser);
}
