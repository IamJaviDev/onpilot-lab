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
import { AppointmentsService } from './appointments.service';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

@Controller('appointments')
@UseGuards(JwtAuthGuard)
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(
    @BusinessId() businessId: string,
    @Query() query: ListAppointmentsQueryDto,
  ) {
    return this.appointmentsService.list(businessId, query);
  }

  @Post()
  async create(
    @BusinessId() businessId: string,
    @CurrentUser() user: CurrentUserContext,
    @AuditMetaDecorator() meta: AuditMeta,
    @Body() dto: CreateAppointmentDto,
  ) {
    const appointment = await this.appointmentsService.create(
      businessId,
      user.id,
      dto,
    );
    await this.audit.record({
      businessId,
      userId: user.id,
      action: AUDIT_ACTIONS.APPOINTMENT_CREATE,
      resourceType: AUDIT_RESOURCES.APPOINTMENT,
      resourceId: appointment.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return appointment;
  }

  @Get(':id')
  getOne(
    @BusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.appointmentsService.getOne(businessId, id);
  }

  @Patch(':id')
  async update(
    @BusinessId() businessId: string,
    @CurrentUser() user: CurrentUserContext,
    @AuditMetaDecorator() meta: AuditMeta,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    const appointment = await this.appointmentsService.update(
      businessId,
      id,
      dto,
    );
    await this.audit.record({
      businessId,
      userId: user.id,
      action: AUDIT_ACTIONS.APPOINTMENT_UPDATE,
      resourceType: AUDIT_RESOURCES.APPOINTMENT,
      resourceId: id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return appointment;
  }

  @Patch(':id/cancel')
  async cancel(
    @BusinessId() businessId: string,
    @CurrentUser() user: CurrentUserContext,
    @AuditMetaDecorator() meta: AuditMeta,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelAppointmentDto,
  ) {
    const appointment = await this.appointmentsService.cancel(
      businessId,
      id,
      dto,
    );
    await this.audit.record({
      businessId,
      userId: user.id,
      action: AUDIT_ACTIONS.APPOINTMENT_CANCEL,
      resourceType: AUDIT_RESOURCES.APPOINTMENT,
      resourceId: id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { reason: dto.reason ?? null },
    });
    return appointment;
  }

  @Patch(':id/no-show')
  async noShow(
    @BusinessId() businessId: string,
    @CurrentUser() user: CurrentUserContext,
    @AuditMetaDecorator() meta: AuditMeta,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const appointment = await this.appointmentsService.noShow(businessId, id);
    await this.audit.record({
      businessId,
      userId: user.id,
      action: AUDIT_ACTIONS.APPOINTMENT_NO_SHOW,
      resourceType: AUDIT_RESOURCES.APPOINTMENT,
      resourceId: id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return appointment;
  }
}
