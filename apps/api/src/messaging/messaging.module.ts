import { Module } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { WhatsAppAdapter } from './whatsapp.adapter';

/**
 * Módulo de mensajería (H2). Cubre la recepción del webhook de WhatsApp
 * (verificación, firma, dedupe, persistencia) y el envío saliente vía
 * WhatsAppAdapter. El BotEngine llega en tareas posteriores; de momento el
 * único emisor es el eco temporal de la Tarea 3.
 *
 * PrismaService y ConfigService son globales, no hace falta importarlos.
 */
@Module({
  controllers: [WebhookController],
  providers: [WebhookService, ConversationService, WhatsAppAdapter],
})
export class MessagingModule {}
