import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { ListClientsQueryDto } from './dto/list-clients-query.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { UpdateClientVipDto } from './dto/update-client-vip.dto';

@Controller('clients')
@UseGuards(JwtAuthGuard)
export class ClientsController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@BusinessId() businessId: string, @Query() query: ListClientsQueryDto) {
    return this.clientsService.list(businessId, query);
  }

  @Post()
  async create(
    @BusinessId() businessId: string,
    @CurrentUser() user: CurrentUserContext,
    @AuditMetaDecorator() meta: AuditMeta,
    @Body() dto: CreateClientDto,
  ) {
    const client = await this.clientsService.create(businessId, dto);
    await this.audit.record({
      businessId,
      userId: user.id,
      action: AUDIT_ACTIONS.CLIENT_CREATE,
      resourceType: AUDIT_RESOURCES.CLIENT,
      resourceId: client.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return client;
  }

  @Get(':id')
  getOne(
    @BusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.clientsService.getOne(businessId, id);
  }

  @Patch(':id')
  async update(
    @BusinessId() businessId: string,
    @CurrentUser() user: CurrentUserContext,
    @AuditMetaDecorator() meta: AuditMeta,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
  ) {
    const client = await this.clientsService.update(businessId, id, dto);
    await this.audit.record({
      businessId,
      userId: user.id,
      action: AUDIT_ACTIONS.CLIENT_UPDATE,
      resourceType: AUDIT_RESOURCES.CLIENT,
      resourceId: id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return client;
  }

  @Patch(':id/vip')
  async updateVip(
    @BusinessId() businessId: string,
    @CurrentUser() user: CurrentUserContext,
    @AuditMetaDecorator() meta: AuditMeta,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientVipDto,
  ) {
    const client = await this.clientsService.updateVip(businessId, id, dto);
    await this.audit.record({
      businessId,
      userId: user.id,
      action: AUDIT_ACTIONS.CLIENT_VIP_UPDATE,
      resourceType: AUDIT_RESOURCES.CLIENT,
      resourceId: id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: {
        isVip: dto.isVip,
        vipDiscountPercent: dto.vipDiscountPercent,
      },
    });
    return client;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @BusinessId() businessId: string,
    @CurrentUser() user: CurrentUserContext,
    @AuditMetaDecorator() meta: AuditMeta,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.clientsService.remove(businessId, id);
    await this.audit.record({
      businessId,
      userId: user.id,
      action: AUDIT_ACTIONS.CLIENT_DELETE,
      resourceType: AUDIT_RESOURCES.CLIENT,
      resourceId: id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }
}
