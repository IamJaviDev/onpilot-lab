import { Module } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

/**
 * Módulo de mensajería (H2). En esta tarea cubre solo la recepción del webhook
 * de WhatsApp (verificación, firma, dedupe, persistencia). Envío saliente y
 * BotEngine llegan en tareas posteriores.
 *
 * PrismaService y ConfigService son globales, no hace falta importarlos.
 */
@Module({
  controllers: [WebhookController],
  providers: [WebhookService, ConversationService],
})
export class MessagingModule {}
