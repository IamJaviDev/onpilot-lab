import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { ListClientsQueryDto } from './dto/list-clients-query.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { UpdateClientVipDto } from './dto/update-client-vip.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

// Tamaño de las listas de la ficha enriquecida (sin paginación en MVP).
const HISTORY_LIMIT = 10;

// Estados de cita "activa" (bloquean disponibilidad, cuentan como próximas)
// y "terminal" (historial). Una cita activa con startsAt ya pasado (vencida
// sin cerrar) no cae en ninguna lista: aceptable en MVP (micro-deuda).
const ACTIVE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
];
const TERMINAL_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.COMPLETED,
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
];

// Solo se seleccionan los campos que expone la ficha (servicio embebido).
const APPOINTMENT_SELECT = {
  id: true,
  startsAt: true,
  endsAt: true,
  status: true,
  service: { select: { id: true, name: true } },
} satisfies Prisma.AppointmentSelect;

const PAYMENT_SELECT = {
  id: true,
  basePrice: true,
  vipDiscountAmount: true,
  manualDiscountAmount: true,
  finalPrice: true,
  paymentMethod: true,
  status: true,
  paidAt: true,
  service: { select: { id: true, name: true } },
} satisfies Prisma.PaymentSelect;

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

interface AppointmentRow {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
  service: { id: string; name: string };
}

interface PaymentRow {
  id: string;
  basePrice: Prisma.Decimal;
  vipDiscountAmount: Prisma.Decimal;
  manualDiscountAmount: Prisma.Decimal;
  finalPrice: Prisma.Decimal;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  paidAt: Date | null;
  service: { id: string; name: string } | null;
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

  // Ficha básica (datos del cliente). La usan create/update/updateVip para
  // NO disparar las agregaciones caras de la ficha enriquecida.
  private async findBasic(businessId: string, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, businessId, deletedAt: null },
    });
    if (!client) {
      throw new NotFoundException('Client not found');
    }
    return this.toDetail(client);
  }

  // Ficha enriquecida (GET /clients/:id): datos básicos + stats + historial +
  // próximas citas. Gate multi-tenant PRIMERO (404 antes de agregar nada);
  // solo tras pasarlo se lanzan las agregaciones, cada una filtrada por
  // businessId + clientId.
  async getOne(businessId: string, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, businessId, deletedAt: null },
    });
    if (!client) {
      throw new NotFoundException('Client not found');
    }

    const [stats, appointments, upcomingAppointments, payments] =
      await Promise.all([
        this.computeStats(businessId, id),
        this.getPastAppointments(businessId, id),
        this.getUpcomingAppointments(businessId, id),
        this.getRecentPayments(businessId, id),
      ]);

    return {
      ...this.toDetail(client),
      stats: {
        ...stats,
        // La próxima cita es la primera de la lista (orden startsAt asc).
        nextAppointmentAt: upcomingAppointments[0]?.startsAt ?? null,
      },
      appointments,
      upcomingAppointments,
      payments,
    };
  }

  // Stats agregadas del cliente. Dinero SIEMPRE en Decimal; el Number() se
  // aplica solo al serializar (regla de oro).
  private async computeStats(businessId: string, clientId: string) {
    const [totalVisits, paidAgg, lastVisit] = await Promise.all([
      this.prisma.appointment.count({
        where: {
          businessId,
          clientId,
          status: AppointmentStatus.COMPLETED,
          deletedAt: null,
        },
      }),
      this.prisma.payment.aggregate({
        where: { businessId, clientId, status: PaymentStatus.PAID },
        _sum: { finalPrice: true },
        _count: true,
      }),
      this.prisma.appointment.findFirst({
        where: {
          businessId,
          clientId,
          status: AppointmentStatus.COMPLETED,
          deletedAt: null,
        },
        orderBy: { startsAt: 'desc' },
        select: { startsAt: true },
      }),
    ]);

    const totalSpent = paidAgg._sum.finalPrice ?? new Prisma.Decimal(0);
    const paidCount = paidAgg._count;
    const averageTicket =
      paidCount > 0
        ? totalSpent
            .div(paidCount)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
        : new Prisma.Decimal(0);

    return {
      totalVisits,
      totalSpent: Number(totalSpent),
      averageTicket: Number(averageTicket),
      lastVisitAt: lastVisit?.startsAt ?? null,
    };
  }

  private async getUpcomingAppointments(businessId: string, clientId: string) {
    const rows = await this.prisma.appointment.findMany({
      where: {
        businessId,
        clientId,
        deletedAt: null,
        status: { in: ACTIVE_STATUSES },
        startsAt: { gte: new Date() },
      },
      orderBy: { startsAt: 'asc' },
      take: HISTORY_LIMIT,
      select: APPOINTMENT_SELECT,
    });
    return rows.map((row) => this.toAppointmentItem(row));
  }

  private async getPastAppointments(businessId: string, clientId: string) {
    const rows = await this.prisma.appointment.findMany({
      where: {
        businessId,
        clientId,
        deletedAt: null,
        status: { in: TERMINAL_STATUSES },
      },
      orderBy: { startsAt: 'desc' },
      take: HISTORY_LIMIT,
      select: APPOINTMENT_SELECT,
    });
    return rows.map((row) => this.toAppointmentItem(row));
  }

  private async getRecentPayments(businessId: string, clientId: string) {
    const rows = await this.prisma.payment.findMany({
      where: { businessId, clientId },
      orderBy: { paidAt: 'desc' },
      take: HISTORY_LIMIT,
      select: PAYMENT_SELECT,
    });
    return rows.map((row) => this.toPaymentItem(row));
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
    return this.findBasic(businessId, id);
  }

  async updateVip(businessId: string, id: string, dto: UpdateClientVipDto) {
    const result = await this.prisma.client.updateMany({
      where: { id, businessId, deletedAt: null },
      data: { isVip: dto.isVip, vipDiscountPercent: dto.vipDiscountPercent },
    });
    if (result.count === 0) {
      throw new NotFoundException('Client not found');
    }
    return this.findBasic(businessId, id);
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

  private toAppointmentItem(row: AppointmentRow) {
    return {
      id: row.id,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      status: row.status,
      service: row.service,
    };
  }

  // Importes como Number SOLO para display (regla de oro).
  private toPaymentItem(row: PaymentRow) {
    return {
      id: row.id,
      basePrice: Number(row.basePrice),
      vipDiscountAmount: Number(row.vipDiscountAmount),
      manualDiscountAmount: Number(row.manualDiscountAmount),
      finalPrice: Number(row.finalPrice),
      paymentMethod: row.paymentMethod,
      status: row.status,
      paidAt: row.paidAt,
      service: row.service,
    };
  }
}
