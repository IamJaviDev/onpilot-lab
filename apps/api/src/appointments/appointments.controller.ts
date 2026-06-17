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
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  list(
    @BusinessId() businessId: string,
    @Query() query: ListAppointmentsQueryDto,
  ) {
    return this.appointmentsService.list(businessId, query);
  }

  @Post()
  create(
    @BusinessId() businessId: string,
    @CurrentUser() user: CurrentUserContext,
    @Body() dto: CreateAppointmentDto,
  ) {
    return this.appointmentsService.create(businessId, user.id, dto);
  }

  @Get(':id')
  getOne(
    @BusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.appointmentsService.getOne(businessId, id);
  }

  @Patch(':id')
  update(
    @BusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    return this.appointmentsService.update(businessId, id, dto);
  }

  @Patch(':id/cancel')
  cancel(
    @BusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelAppointmentDto,
  ) {
    return this.appointmentsService.cancel(businessId, id, dto);
  }

  @Patch(':id/no-show')
  noShow(
    @BusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.appointmentsService.noShow(businessId, id);
  }
}
