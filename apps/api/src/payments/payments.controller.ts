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
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto';
import { MarkPaymentErrorDto } from './dto/mark-payment-error.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  list(@BusinessId() businessId: string, @Query() query: ListPaymentsQueryDto) {
    return this.paymentsService.list(businessId, query);
  }

  @Post()
  create(
    @BusinessId() businessId: string,
    @CurrentUser() user: CurrentUserContext,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.paymentsService.create(businessId, user.id, dto);
  }

  @Get(':id')
  getOne(
    @BusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paymentsService.getOne(businessId, id);
  }

  @Patch(':id/mark-error')
  markError(
    @BusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkPaymentErrorDto,
  ) {
    return this.paymentsService.markError(businessId, id, dto);
  }
}
