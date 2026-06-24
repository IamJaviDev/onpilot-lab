import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { BusinessId } from '../auth/decorators/business-id.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CashService } from './cash.service';
import { CashSummaryQueryDto } from './dto/cash-summary-query.dto';

@Controller('cash')
@UseGuards(JwtAuthGuard)
export class CashController {
  constructor(private readonly cashService: CashService) {}

  @Get('summary')
  summary(
    @BusinessId() businessId: string,
    @Query() query: CashSummaryQueryDto,
  ) {
    return this.cashService.summary(businessId, query);
  }
}
