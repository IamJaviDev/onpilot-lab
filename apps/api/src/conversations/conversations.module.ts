import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MessagingModule } from '../messaging/messaging.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

/**
 * Lectura del panel de conversaciones (H2 T8/9). Responsabilidad separada de
 * MessagingModule (que es escritura: webhook, bot, envío, recordatorios), igual
 * que ClientsModule. PrismaService es global.
 *
 * Importa AuthModule para que el JwtAuthGuard de los endpoints resuelva
 * JwtService (mismo patrón que Clients/Services/Appointments), y MessagingModule
 * para reutilizar WhatsAppAdapter + ConversationService en el envío manual (T9).
 * Acíclico: messaging no conoce conversations.
 */
@Module({
  imports: [AuthModule, MessagingModule],
  controllers: [ConversationsController],
  providers: [ConversationsService],
})
export class ConversationsModule {}
