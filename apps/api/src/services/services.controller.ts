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
import { CreateServiceDto } from './dto/create-service.dto';
import { ListServicesQueryDto } from './dto/list-services-query.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { ServicesService } from './services.service';

@Controller('services')
@UseGuards(JwtAuthGuard)
export class ServicesController {
  constructor(
    private readonly servicesService: ServicesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@BusinessId() businessId: string, @Query() query: ListServicesQueryDto) {
    return this.servicesService.list(businessId, query);
  }

  @Post()
  async create(
    @BusinessId() businessId: string,
    @CurrentUser() user: CurrentUserContext,
    @AuditMetaDecorator() meta: AuditMeta,
    @Body() dto: CreateServiceDto,
  ) {
    const service = await this.servicesService.create(businessId, dto);
    await this.audit.record({
      businessId,
      userId: user.id,
      action: AUDIT_ACTIONS.SERVICE_CREATE,
      resourceType: AUDIT_RESOURCES.SERVICE,
      resourceId: service.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return service;
  }

  @Get(':id')
  getOne(
    @BusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.servicesService.getOne(businessId, id);
  }

  @Patch(':id')
  async update(
    @BusinessId() businessId: string,
    @CurrentUser() user: CurrentUserContext,
    @AuditMetaDecorator() meta: AuditMeta,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    const service = await this.servicesService.update(businessId, id, dto);
    await this.audit.record({
      businessId,
      userId: user.id,
      action: AUDIT_ACTIONS.SERVICE_UPDATE,
      resourceType: AUDIT_RESOURCES.SERVICE,
      resourceId: id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return service;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @BusinessId() businessId: string,
    @CurrentUser() user: CurrentUserContext,
    @AuditMetaDecorator() meta: AuditMeta,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.servicesService.remove(businessId, id);
    await this.audit.record({
      businessId,
      userId: user.id,
      action: AUDIT_ACTIONS.SERVICE_DELETE,
      resourceType: AUDIT_RESOURCES.SERVICE,
      resourceId: id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }
}
