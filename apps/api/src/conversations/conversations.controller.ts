import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AUDIT_ACTIONS, AUDIT_RESOURCES } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import {
  AuditMeta as AuditMetaDecorator,
  type AuditMeta,
} from '../audit/decorators/audit-meta.decorator';
import type { CurrentUserContext } from '../auth/auth-context.types';
import { BusinessId } from '../auth/decorators/business-id.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConversationsService } from './conversations.service';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { SendMessageDto } from './dto/send-message.dto';

/**
 * Panel de conversaciones (H2 T8/9). Lecturas (T8) y escrituras del profesional
 * (T9: tomar control, devolver al bot, responder a mano). El businessId lo pone
 * el backend desde el usuario autenticado (@BusinessId), nunca el frontend.
 *
 * Las escrituras se auditan desde el controller tras resolver el service
 * (patrón H1, fuera de transacción, no bloqueante). Las lecturas no se auditan.
 */
@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(
    @BusinessId() businessId: string,
    @Query() query: ListConversationsQueryDto,
  ) {
    return this.conversations.list(businessId, query);
  }

  @Get(':id/messages')
  getMessages(
    @BusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.conversations.getThread(businessId, id);
  }

  @Patch(':id/take-control')
  async takeControl(
    @BusinessId() businessId: string,
    @CurrentUser() user: CurrentUserContext,
    @AuditMetaDecorator() meta: AuditMeta,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const result = await this.conversations.takeControl(businessId, id);
    // Solo se audita la transición REAL (un idempotente no genera ruido).
    if (result.changed) {
      await this.audit.record({
        businessId,
        userId: user.id,
        action: AUDIT_ACTIONS.CONVERSATION_TAKE_CONTROL,
        resourceType: AUDIT_RESOURCES.CONVERSATION,
        resourceId: id,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    }
    return result;
  }

  @Patch(':id/release')
  async release(
    @BusinessId() businessId: string,
    @CurrentUser() user: CurrentUserContext,
    @AuditMetaDecorator() meta: AuditMeta,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const result = await this.conversations.release(businessId, id);
    if (result.changed) {
      await this.audit.record({
        businessId,
        userId: user.id,
        action: AUDIT_ACTIONS.CONVERSATION_RELEASE,
        resourceType: AUDIT_RESOURCES.CONVERSATION,
        resourceId: id,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    }
    return result;
  }

  @Post(':id/messages')
  async sendMessage(
    @BusinessId() businessId: string,
    @CurrentUser() user: CurrentUserContext,
    @AuditMetaDecorator() meta: AuditMeta,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ) {
    const result = await this.conversations.sendManualMessage(
      businessId,
      id,
      dto.body,
    );
    await this.audit.record({
      businessId,
      userId: user.id,
      action: AUDIT_ACTIONS.CONVERSATION_MANUAL_MESSAGE,
      resourceType: AUDIT_RESOURCES.CONVERSATION,
      resourceId: id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      // NUNCA el cuerpo (puede contener datos del cliente): solo la longitud.
      metadata: { length: dto.body.length },
    });
    return result;
  }
}
