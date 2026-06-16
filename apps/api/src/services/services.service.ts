import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { ListServicesQueryDto } from './dto/list-services-query.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  basePrice: Prisma.Decimal;
  durationMinutes: number;
  isActive: boolean;
  createdAt: Date;
}

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(businessId: string, query: ListServicesQueryDto) {
    const where: Prisma.ServiceWhereInput = { businessId, deletedAt: null };
    if (query.includeInactive !== true) {
      where.isActive = true;
    }

    const rows = await this.prisma.service.findMany({
      where,
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => this.toDto(row));
  }

  async create(businessId: string, dto: CreateServiceDto) {
    const service = await this.prisma.service.create({
      data: {
        businessId,
        name: dto.name,
        description: dto.description ?? null,
        basePrice: dto.basePrice,
        durationMinutes: dto.durationMinutes,
      },
    });
    return this.toDto(service);
  }

  async getOne(businessId: string, id: string) {
    const service = await this.prisma.service.findFirst({
      where: { id, businessId, deletedAt: null },
    });
    if (!service) {
      throw new NotFoundException('Service not found');
    }
    return this.toDto(service);
  }

  async update(businessId: string, id: string, dto: UpdateServiceDto) {
    const data: Prisma.ServiceUpdateManyMutationInput = {};
    if (typeof dto.name === 'string') data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (typeof dto.basePrice === 'number') data.basePrice = dto.basePrice;
    if (typeof dto.durationMinutes === 'number')
      data.durationMinutes = dto.durationMinutes;
    if (typeof dto.isActive === 'boolean') data.isActive = dto.isActive;

    const result = await this.prisma.service.updateMany({
      where: { id, businessId, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new NotFoundException('Service not found');
    }
    return this.getOne(businessId, id);
  }

  async remove(businessId: string, id: string): Promise<void> {
    const result = await this.prisma.service.updateMany({
      where: { id, businessId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException('Service not found');
    }
  }

  private toDto(service: ServiceRow) {
    return {
      id: service.id,
      name: service.name,
      description: service.description,
      // basePrice numérico SOLO para display. El cálculo monetario se hace en
      // backend con Decimal; nunca se recalcula a partir de este number.
      basePrice: Number(service.basePrice),
      durationMinutes: service.durationMinutes,
      isActive: service.isActive,
      createdAt: service.createdAt,
    };
  }
}
