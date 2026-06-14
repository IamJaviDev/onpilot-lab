import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { ListClientsQueryDto } from './dto/list-clients-query.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { UpdateClientVipDto } from './dto/update-client-vip.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

interface ClientRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  isVip: boolean;
  vipDiscountPercent: number;
  createdAt: Date;
}

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(businessId: string, query: ListClientsQueryDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const where: Prisma.ClientWhereInput = { businessId, deletedAt: null };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.client.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toListItem(row)),
      page,
      limit,
      total,
    };
  }

  async create(businessId: string, dto: CreateClientDto) {
    try {
      const client = await this.prisma.client.create({
        data: {
          businessId,
          name: dto.name,
          phone: dto.phone,
          email: dto.email ?? null,
          notes: dto.notes ?? null,
        },
      });
      return this.toDetail(client);
    } catch (error) {
      throw this.handlePhoneConflict(error);
    }
  }

  async getOne(businessId: string, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, businessId, deletedAt: null },
    });
    if (!client) {
      throw new NotFoundException('Client not found');
    }
    return this.toDetail(client);
  }

  async update(businessId: string, id: string, dto: UpdateClientDto) {
    const data: Prisma.ClientUpdateManyMutationInput = {};
    if (typeof dto.name === 'string') data.name = dto.name;
    if (typeof dto.phone === 'string') data.phone = dto.phone;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.notes !== undefined) data.notes = dto.notes;

    try {
      const result = await this.prisma.client.updateMany({
        where: { id, businessId, deletedAt: null },
        data,
      });
      if (result.count === 0) {
        throw new NotFoundException('Client not found');
      }
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw this.handlePhoneConflict(error);
    }
    return this.getOne(businessId, id);
  }

  async updateVip(businessId: string, id: string, dto: UpdateClientVipDto) {
    const result = await this.prisma.client.updateMany({
      where: { id, businessId, deletedAt: null },
      data: { isVip: dto.isVip, vipDiscountPercent: dto.vipDiscountPercent },
    });
    if (result.count === 0) {
      throw new NotFoundException('Client not found');
    }
    return this.getOne(businessId, id);
  }

  async remove(businessId: string, id: string): Promise<void> {
    const result = await this.prisma.client.updateMany({
      where: { id, businessId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException('Client not found');
    }
  }

  private handlePhoneConflict(error: unknown): Error {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException(
        'A client with this phone already exists in this business',
      );
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  // Tags triviales en MVP: VIP o NEW. Los tags por actividad (REACTIVATE,
  // REGULAR) llegarán con la ficha enriquecida cuando existan citas/cobros.
  private computeTags(client: ClientRow): string[] {
    return client.isVip ? ['VIP'] : ['NEW'];
  }

  private toListItem(client: ClientRow) {
    return {
      id: client.id,
      name: client.name,
      phone: client.phone,
      email: client.email,
      isVip: client.isVip,
      vipDiscountPercent: client.vipDiscountPercent,
      tags: this.computeTags(client),
      createdAt: client.createdAt,
    };
  }

  private toDetail(client: ClientRow) {
    return { ...this.toListItem(client), notes: client.notes };
  }
}
