import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { ClientsModule } from '../clients/clients.module';
import { BotEngineService } from './bot-engine.service';
import { BotToolsService } from './bot-tools.service';
import { ConversationService } from './conversation.service';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { WhatsAppAdapter } from './whatsapp.adapter';

/**
 * Módulo de mensajería (H2). Cubre la recepción del webhook de WhatsApp
 * (verificación, firma, dedupe, persistencia), el envío saliente vía
 * WhatsAppAdapter y el BotEngine (Claude Haiku): conversación informativa
 * (T4) + acciones de agenda vía tool use (T5, reutilizando Appointments/
 * Clients de H1 — de ahí los imports).
 *
 * PrismaService y ConfigService son globales, no hace falta importarlos.
 */
@Module({
  imports: [AppointmentsModule, ClientsModule],
  controllers: [WebhookController],
  providers: [
    WebhookService,
    ConversationService,
    WhatsAppAdapter,
    BotEngineService,
    BotToolsService,
  ],
})
export class MessagingModule {}
