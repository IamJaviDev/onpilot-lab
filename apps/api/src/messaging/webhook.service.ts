import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConversationStatus } from '../generated/prisma/client';
import { BotEngineService } from './bot-engine.service';
import { ConversationService } from './conversation.service';
import { normalizePhone } from './phone.util';
import { isValidSignature } from './signature.util';
import { WhatsAppAdapter } from './whatsapp.adapter';
import type {
  WhatsAppChangeValue,
  WhatsAppWebhookPayload,
} from './whatsapp-payload.types';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly conversations: ConversationService,
    private readonly whatsapp: WhatsAppAdapter,
    private readonly botEngine: BotEngineService,
  ) {}

  /** Token que Meta debe repetir en el GET de verificación (hub challenge). */
  get verifyToken(): string {
    return this.config.getOrThrow<string>('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
  }

  /**
   * Valida la firma del webhook contra el App Secret. Sin firma válida no se
   * procesa nada. La lógica HMAC vive en signature.util (pura y testeada).
   */
  verifySignature(
    rawBody: Buffer,
    signatureHeader: string | undefined,
  ): boolean {
    return isValidSignature(
      rawBody,
      signatureHeader,
      this.config.getOrThrow<string>('WHATSAPP_APP_SECRET'),
    );
  }

  /**
   * Procesa un payload ya verificado: extrae los mensajes de texto entrantes,
   * resuelve el negocio y los persiste. Diseñado para ser encolable tal cual en
   * la Tarea 7 (Bull) sin tocar el controller.
   *
   * Ignora explícitamente statuses (delivered/read) y tipos no-texto.
   */
  async handleIncoming(payload: WhatsAppWebhookPayload): Promise<void> {
    const expectedPhoneNumberId = this.config.getOrThrow<string>(
      'WHATSAPP_PHONE_NUMBER_ID',
    );
    const businessId = this.config.getOrThrow<string>('WHATSAPP_BUSINESS_ID');

    const values: WhatsAppChangeValue[] =
      payload.entry?.flatMap(
        (entry) => entry.changes?.map((c) => c.value) ?? [],
      ) ?? [];

    for (const value of values) {
      // Los statuses (delivered/read) llegan por el mismo webhook: ignorar.
      if (value.statuses?.length) {
        this.logger.debug(`Ignoring ${value.statuses.length} status update(s)`);
      }

      const messages = value.messages ?? [];
      if (messages.length === 0) continue;

      // Resolución de negocio v1-sandbox: mapeo phone_number_id → businessId por
      // env. NUNCA se toma businessId del payload ni se hardcodea. La resolución
      // multi-tenant real (registro de números por negocio / BotConfig) llega en
      // tareas posteriores.
      const phoneNumberId = value.metadata?.phone_number_id;
      if (phoneNumberId !== expectedPhoneNumberId) {
        this.logger.warn(
          `Webhook for unknown phone_number_id=${phoneNumberId ?? '(none)'}; ` +
            `ignored (no business mapping)`,
        );
        continue;
      }

      for (const message of messages) {
        const body = message.text?.body;
        if (message.type !== 'text' || !body) {
          this.logger.debug(
            `Ignoring non-text message (type=${message.type}, id=${message.id})`,
          );
          continue;
        }

        const result = await this.conversations.persistIncoming({
          businessId,
          phone: normalizePhone(message.from),
          body,
          waMessageId: message.id,
          timestamp: parseWhatsAppTimestamp(message.timestamp),
        });

        // BotEngine v0 (Tarea 4). Activación solo con el string EXACTO 'true'
        // (cualquier otro valor u omisión = apagado, default silencioso a
        // prueba de typos). No se responde en duplicados (dedupe) ni fuera de
        // BOT_ACTIVE: en HUMAN_CONTROL / PENDING_REVIEW el sistema no responde
        // (patrón de la Tarea 6). Solo llegan aquí mensajes de texto (los
        // demás tipos se descartan arriba).
        if (
          this.config.get<string>('BOT_ENGINE_ENABLED') === 'true' &&
          result.persisted &&
          result.conversationStatus === ConversationStatus.BOT_ACTIVE
        ) {
          await this.respondWithBot(
            businessId,
            result.conversationId,
            message.from,
          );
        }
      }
    }
  }

  /**
   * Orquestación del bot (generar → enviar → persistir); el BotEngine solo
   * genera texto. Nunca rompe la recepción: si la generación devuelve null
   * (fallo de Claude, etc.) no se envía nada, y si el envío o la persistencia
   * del OUT fallan (token, ventana 24h, red…), se loguea y ya está — el IN
   * quedó persistido y el 200 a Meta ya salió. El cliente no recibe respuesta:
   * mejor silencio que error raro.
   */
  private async respondWithBot(
    businessId: string,
    conversationId: string,
    to: string,
  ): Promise<void> {
    try {
      const reply = await this.botEngine.generateReply({
        businessId,
        conversationId,
      });
      if (!reply) return;

      const { waMessageId } = await this.whatsapp.sendText(to, reply.body);
      await this.conversations.persistOutgoing({
        businessId,
        conversationId,
        body: reply.body,
        waMessageId,
        metadata: reply.metadata,
      });
    } catch (error) {
      this.logger.error(
        'Bot reply failed (incoming message is already persisted)',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

/**
 * Convierte el timestamp de Cloud API (unix epoch en segundos, como string) a
 * Date. Si es inválido, cae a "ahora".
 */
function parseWhatsAppTimestamp(timestamp: string | undefined): Date {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return new Date();
  return new Date(seconds * 1000);
}
