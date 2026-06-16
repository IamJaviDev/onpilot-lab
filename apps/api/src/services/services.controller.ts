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
import { BusinessId } from '../auth/decorators/business-id.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateServiceDto } from './dto/create-service.dto';
import { ListServicesQueryDto } from './dto/list-services-query.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { ServicesService } from './services.service';

@Controller('services')
@UseGuards(JwtAuthGuard)
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  list(@BusinessId() businessId: string, @Query() query: ListServicesQueryDto) {
    return this.servicesService.list(businessId, query);
  }

  @Post()
  create(@BusinessId() businessId: string, @Body() dto: CreateServiceDto) {
    return this.servicesService.create(businessId, dto);
  }

  @Get(':id')
  getOne(
    @BusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.servicesService.getOne(businessId, id);
  }

  @Patch(':id')
  update(
    @BusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.servicesService.update(businessId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @BusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.servicesService.remove(businessId, id);
  }
}
