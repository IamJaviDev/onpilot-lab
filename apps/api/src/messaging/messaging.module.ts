import { Module } from '@nestjs/common';
import { BotEngineService } from './bot-engine.service';
import { ConversationService } from './conversation.service';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { WhatsAppAdapter } from './whatsapp.adapter';

/**
 * Módulo de mensajería (H2). Cubre la recepción del webhook de WhatsApp
 * (verificación, firma, dedupe, persistencia), el envío saliente vía
 * WhatsAppAdapter y la respuesta automática del BotEngine v0 (Claude Haiku,
 * conversación informativa — Tarea 4).
 *
 * PrismaService y ConfigService son globales, no hace falta importarlos.
 */
@Module({
  controllers: [WebhookController],
  providers: [
    WebhookService,
    ConversationService,
    WhatsAppAdapter,
    BotEngineService,
  ],
})
export class MessagingModule {}
