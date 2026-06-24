import { Controller, Get, UseGuards } from '@nestjs/common';
import { BusinessId } from '../auth/decorators/business-id.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('h1')
  h1(@BusinessId() businessId: string) {
    return this.dashboardService.h1(businessId);
  }
}
