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
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto';
import { MarkPaymentErrorDto } from './dto/mark-payment-error.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@BusinessId() businessId: string, @Query() query: ListPaymentsQueryDto) {
    return this.paymentsService.list(businessId, query);
  }

  @Post()
  async create(
    @BusinessId() businessId: string,
    @CurrentUser() user: CurrentUserContext,
    @AuditMetaDecorator() meta: AuditMeta,
    @Body() dto: CreatePaymentDto,
  ) {
    const payment = await this.paymentsService.create(businessId, user.id, dto);
    await this.audit.record({
      businessId,
      userId: user.id,
      action: AUDIT_ACTIONS.PAYMENT_CREATE,
      resourceType: AUDIT_RESOURCES.PAYMENT,
      resourceId: payment.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return payment;
  }

  @Get(':id')
  getOne(
    @BusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paymentsService.getOne(businessId, id);
  }

  @Patch(':id/mark-error')
  async markError(
    @BusinessId() businessId: string,
    @CurrentUser() user: CurrentUserContext,
    @AuditMetaDecorator() meta: AuditMeta,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkPaymentErrorDto,
  ) {
    const payment = await this.paymentsService.markError(businessId, id, dto);
    await this.audit.record({
      businessId,
      userId: user.id,
      action: AUDIT_ACTIONS.PAYMENT_MARK_ERROR,
      resourceType: AUDIT_RESOURCES.PAYMENT,
      resourceId: id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { reason: dto.reason },
    });
    return payment;
  }
}
