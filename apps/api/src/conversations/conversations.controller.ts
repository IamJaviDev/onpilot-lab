import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BusinessId } from '../auth/decorators/business-id.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConversationsService } from './conversations.service';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';

/**
 * Panel de conversaciones (H2 T8/9): endpoints de SOLO LECTURA. El businessId
 * lo pone el backend desde el usuario autenticado (@BusinessId), nunca el
 * frontend. Tomar control / responder a mano son la T9.
 */
@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

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
}
