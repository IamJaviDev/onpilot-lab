import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

// Estados que ocupan hueco en la agenda → bloquean solapamiento y son los
// únicos editables. CANCELLED/NO_SHOW/COMPLETED ni bloquean ni se editan.
const ACTIVE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
];

const TERMINAL_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.COMPLETED,
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
];

// Datos de cliente/servicio embebidos en la respuesta de una cita.
const APPOINTMENT_INCLUDE = {
  client: { select: { id: true, name: true, phone: true } },
  service: { select: { id: true, name: true, basePrice: true } },
} satisfies Prisma.AppointmentInclude;

type AppointmentWithRelations = Prisma.AppointmentGetPayload<{
  include: typeof APPOINTMENT_INCLUDE;
}>;

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(businessId: string, query: ListAppointmentsQueryDto) {
    const where: Prisma.AppointmentWhereInput = { businessId, deletedAt: null };
    if (query.clientId) where.clientId = query.clientId;
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      const startsAt: Prisma.DateTimeFilter = {};
      if (query.from) startsAt.gte = new Date(query.from);
      if (query.to) startsAt.lte = new Date(query.to);
      where.startsAt = startsAt;
    }

    const rows = await this.prisma.appointment.findMany({
      where,
      include: APPOINTMENT_INCLUDE,
      orderBy: { startsAt: 'asc' },
    });
    return rows.map((row) => this.toDto(row));
  }

  async create(
    businessId: string,
    createdById: string,
    dto: CreateAppointmentDto,
  ) {
    const startsAt = new Date(dto.startsAt);
    this.assertNotPast(startsAt);

    // Novedad multi-tenant de Appointments: clientId y serviceId vienen del
    // frontend → validar pertenencia al negocio (existen + no borrados) y que
    // el servicio esté activo, antes de crear nada.
    await this.requireClient(businessId, dto.clientId);
    const service = await this.requireActiveService(businessId, dto.serviceId);

    const endsAt = this.computeEndsAt(startsAt, service.durationMinutes);

    const appointment = await this.prisma.$transaction(async (tx) => {
      await this.assertNoOverlap(tx, businessId, startsAt, endsAt, null);
      return tx.appointment.create({
        data: {
          businessId,
          clientId: dto.clientId,
          serviceId: dto.serviceId,
          startsAt,
          endsAt,
          notes: dto.notes ?? null,
          createdById,
          // status CONFIRMED y source MANUAL por default del schema.
        },
        include: APPOINTMENT_INCLUDE,
      });
    });
    return this.toDto(appointment);
  }

  async getOne(businessId: string, id: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, businessId, deletedAt: null },
      include: APPOINTMENT_INCLUDE,
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    return this.toDto(appointment);
  }

  async update(businessId: string, id: string, dto: UpdateAppointmentDto) {
    const current = await this.requireEditable(businessId, id);

    const changesTiming =
      dto.startsAt !== undefined || dto.serviceId !== undefined;

    const startsAt =
      dto.startsAt !== undefined ? new Date(dto.startsAt) : current.startsAt;
    if (dto.startsAt !== undefined) {
      this.assertNotPast(startsAt);
    }

    const data: Prisma.AppointmentUncheckedUpdateManyInput = {};
    if (dto.notes !== undefined) data.notes = dto.notes;

    let endsAt = current.endsAt;
    if (changesTiming) {
      // Duración: del servicio nuevo (validado activo) o, si solo cambia la
      // hora, del servicio actual de la cita.
      let durationMinutes: number;
      if (dto.serviceId !== undefined) {
        const service = await this.requireActiveService(
          businessId,
          dto.serviceId,
        );
        durationMinutes = service.durationMinutes;
        data.serviceId = dto.serviceId;
      } else {
        durationMinutes = await this.serviceDuration(
          businessId,
          current.serviceId,
        );
      }
      endsAt = this.computeEndsAt(startsAt, durationMinutes);
      data.startsAt = startsAt;
      data.endsAt = endsAt;
    }

    await this.prisma.$transaction(async (tx) => {
      if (changesTiming) {
        await this.assertNoOverlap(tx, businessId, startsAt, endsAt, id);
      }
      const result = await tx.appointment.updateMany({
        where: {
          id,
          businessId,
          deletedAt: null,
          status: { in: ACTIVE_STATUSES },
        },
        data,
      });
      if (result.count === 0) {
        throw new NotFoundException('Appointment not found');
      }
    });

    return this.getOne(businessId, id);
  }

  async cancel(businessId: string, id: string, dto: CancelAppointmentDto) {
    await this.requireEditable(businessId, id);
    const result = await this.prisma.appointment.updateMany({
      where: {
        id,
        businessId,
        deletedAt: null,
        status: { in: ACTIVE_STATUSES },
      },
      data: {
        status: AppointmentStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: dto.reason ?? null,
      },
    });
    if (result.count === 0) {
      throw new NotFoundException('Appointment not found');
    }
    return this.getOne(businessId, id);
  }

  async noShow(businessId: string, id: string) {
    await this.requireEditable(businessId, id);
    const result = await this.prisma.appointment.updateMany({
      where: {
        id,
        businessId,
        deletedAt: null,
        status: { in: ACTIVE_STATUSES },
      },
      data: { status: AppointmentStatus.NO_SHOW },
    });
    if (result.count === 0) {
      throw new NotFoundException('Appointment not found');
    }
    return this.getOne(businessId, id);
  }

  // --- Helpers ---

  private assertNotPast(startsAt: Date) {
    if (startsAt.getTime() <= Date.now()) {
      throw new BadRequestException('startsAt must be in the future');
    }
  }

  private computeEndsAt(startsAt: Date, durationMinutes: number): Date {
    return new Date(startsAt.getTime() + durationMinutes * 60_000);
  }

  private async requireClient(businessId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, businessId, deletedAt: null },
      select: { id: true },
    });
    if (!client) {
      throw new BadRequestException('Client not found');
    }
    return client;
  }

  private async requireActiveService(businessId: string, serviceId: string) {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, businessId, deletedAt: null, isActive: true },
      select: { id: true, durationMinutes: true },
    });
    if (!service) {
      throw new BadRequestException('Service not found or inactive');
    }
    return service;
  }

  // Duración del servicio ya vinculado a la cita (no se revalida su estado:
  // solo cambia la hora, no el servicio).
  private async serviceDuration(
    businessId: string,
    serviceId: string,
  ): Promise<number> {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, businessId },
      select: { durationMinutes: true },
    });
    if (!service) {
      throw new BadRequestException('Service not found');
    }
    return service.durationMinutes;
  }

  private async requireEditable(businessId: string, id: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, businessId, deletedAt: null },
      select: {
        id: true,
        serviceId: true,
        startsAt: true,
        endsAt: true,
        status: true,
      },
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    if (TERMINAL_STATUSES.includes(appointment.status)) {
      throw new ConflictException('Appointment is in a terminal state');
    }
    return appointment;
  }

  // Solapamiento: cita activa del negocio cuyo intervalo intersecta
  // [startsAt, endsAt). En transacción para coherencia lectura-escritura.
  // Deuda: race teórica entre check e insert no cubierta sin constraint de
  // exclusión Postgres (btree_gist); para MVP es teórica.
  private async assertNoOverlap(
    tx: Prisma.TransactionClient,
    businessId: string,
    startsAt: Date,
    endsAt: Date,
    excludeId: string | null,
  ) {
    const overlap = await tx.appointment.findFirst({
      where: {
        businessId,
        deletedAt: null,
        status: { in: ACTIVE_STATUSES },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (overlap) {
      throw new ConflictException('Appointment overlaps an existing one');
    }
  }

  private toDto(a: AppointmentWithRelations) {
    return {
      id: a.id,
      client: { id: a.client.id, name: a.client.name, phone: a.client.phone },
      service: {
        id: a.service.id,
        name: a.service.name,
        // basePrice numérico SOLO para display (convención monetaria).
        basePrice: Number(a.service.basePrice),
      },
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      status: a.status,
      source: a.source,
      notes: a.notes,
      cancelledAt: a.cancelledAt,
      cancellationReason: a.cancellationReason,
      createdAt: a.createdAt,
    };
  }
}
