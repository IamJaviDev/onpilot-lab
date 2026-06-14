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
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { ListClientsQueryDto } from './dto/list-clients-query.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { UpdateClientVipDto } from './dto/update-client-vip.dto';

@Controller('clients')
@UseGuards(JwtAuthGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  list(@BusinessId() businessId: string, @Query() query: ListClientsQueryDto) {
    return this.clientsService.list(businessId, query);
  }

  @Post()
  create(@BusinessId() businessId: string, @Body() dto: CreateClientDto) {
    return this.clientsService.create(businessId, dto);
  }

  @Get(':id')
  getOne(
    @BusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.clientsService.getOne(businessId, id);
  }

  @Patch(':id')
  update(
    @BusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clientsService.update(businessId, id, dto);
  }

  @Patch(':id/vip')
  updateVip(
    @BusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientVipDto,
  ) {
    return this.clientsService.updateVip(businessId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @BusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.clientsService.remove(businessId, id);
  }
}
