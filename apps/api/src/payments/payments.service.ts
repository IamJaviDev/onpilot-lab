import {
  BadRequestException,
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
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto';
import { MarkPaymentErrorDto } from './dto/mark-payment-error.dto';

// Estados de cita que admiten cobro. COMPLETED queda además bloqueado por el
// @unique(appointmentId); CANCELLED/NO_SHOW son terminales no cobrables.
const CHARGEABLE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
];

interface PaymentRow {
  id: string;
  clientId: string;
  appointmentId: string | null;
  serviceId: string | null;
  basePrice: Prisma.Decimal;
  vipDiscountAmount: Prisma.Decimal;
  manualDiscountAmount: Prisma.Decimal;
  finalPrice: Prisma.Decimal;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  paidAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(businessId: string, createdById: string, dto: CreatePaymentDto) {
    // 1. Cliente del negocio (con datos VIP para el cálculo).
    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, businessId, deletedAt: null },
      select: { id: true, isVip: true, vipDiscountPercent: true },
    });
    if (!client) {
      throw new BadRequestException('Client not found');
    }

    // 2. Resolver la cita (si viene) y validar coherencia.
    let appointmentId: string | null = null;
    let serviceIdFromAppointment: string | null = null;
    if (dto.appointmentId) {
      const appointment = await this.prisma.appointment.findFirst({
        where: { id: dto.appointmentId, businessId, deletedAt: null },
        select: { id: true, clientId: true, serviceId: true, status: true },
      });
      if (!appointment) {
        throw new BadRequestException('Appointment not found');
      }
      if (appointment.clientId !== dto.clientId) {
        throw new BadRequestException(
          'clientId does not match the appointment',
        );
      }
      if (dto.serviceId && dto.serviceId !== appointment.serviceId) {
        throw new BadRequestException(
          'serviceId does not match the appointment',
        );
      }
      if (!CHARGEABLE_STATUSES.includes(appointment.status)) {
        throw new ConflictException('Appointment is not chargeable');
      }
      appointmentId = appointment.id;
      serviceIdFromAppointment = appointment.serviceId;
    }

    // 3. Servicio efectivo: el de la cita si la hay; si no, el del DTO.
    const effectiveServiceId =
      serviceIdFromAppointment ?? dto.serviceId ?? null;
    if (!effectiveServiceId) {
      throw new BadRequestException(
        'A service is required to compute the amount',
      );
    }
    // Servicio del negocio (no se exige isActive: se puede cobrar un servicio
    // desactivado, coherente con Appointments).
    const service = await this.prisma.service.findFirst({
      where: { id: effectiveServiceId, businessId, deletedAt: null },
      select: { id: true, basePrice: true },
    });
    if (!service) {
      throw new BadRequestException('Service not found');
    }

    // 4. Cálculo monetario: TODO con Prisma.Decimal.
    const basePrice = service.basePrice;
    const vipDiscountAmount = client.isVip
      ? basePrice
          .mul(client.vipDiscountPercent)
          .div(100)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
      : new Prisma.Decimal(0);
    const manualDiscountAmount = new Prisma.Decimal(
      dto.manualDiscountAmount ?? 0,
    );
    const finalPrice = basePrice
      .sub(vipDiscountAmount)
      .sub(manualDiscountAmount);
    if (finalPrice.lessThan(0)) {
      throw new BadRequestException('Discounts exceed base price');
    }

    // 5. Persistencia atómica: crear Payment + marcar cita COMPLETED.
    try {
      const payment = await this.prisma.$transaction(async (tx) => {
        const created = await tx.payment.create({
          data: {
            businessId,
            clientId: dto.clientId,
            appointmentId,
            serviceId: service.id,
            basePrice,
            vipDiscountAmount,
            manualDiscountAmount,
            finalPrice,
            paymentMethod: dto.paymentMethod,
            paidAt: new Date(),
            createdById,
            // status PAID por default del schema.
          },
        });

        if (appointmentId) {
          const result = await tx.appointment.updateMany({
            where: {
              id: appointmentId,
              businessId,
              deletedAt: null,
              status: { in: CHARGEABLE_STATUSES },
            },
            data: { status: AppointmentStatus.COMPLETED },
          });
          // Carrera (p.ej. cancelación entre la lectura y aquí): revierte todo.
          if (result.count === 0) {
            throw new ConflictException('Appointment is not chargeable');
          }
        }

        return created;
      });
      return this.toDto(payment);
    } catch (e) {
      // Un cobro por cita: el @unique(appointmentId) garantiza la unicidad.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Appointment already has a payment');
      }
      throw e;
    }
  }

  async list(businessId: string, query: ListPaymentsQueryDto) {
    const where: Prisma.PaymentWhereInput = { businessId };
    if (query.clientId) where.clientId = query.clientId;
    if (query.paymentMethod) where.paymentMethod = query.paymentMethod;
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      const paidAt: Prisma.DateTimeNullableFilter = {};
      if (query.from) paidAt.gte = new Date(query.from);
      if (query.to) paidAt.lte = new Date(query.to);
      where.paidAt = paidAt;
    }

    const rows = await this.prisma.payment.findMany({
      where,
      orderBy: { paidAt: 'desc' },
    });
    return rows.map((row) => this.toDto(row));
  }

  async getOne(businessId: string, id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, businessId },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    return this.toDto(payment);
  }

  async markError(businessId: string, id: string, dto: MarkPaymentErrorDto) {
    // Solo cobros en PAID pasan a ERROR. No se revierte la cita (MVP).
    const result = await this.prisma.payment.updateMany({
      where: { id, businessId, status: PaymentStatus.PAID },
      data: {
        status: PaymentStatus.ERROR,
        markedAsErrorAt: new Date(),
        errorReason: dto.reason,
      },
    });
    if (result.count === 0) {
      throw new NotFoundException('Payment not found');
    }
    return this.getOne(businessId, id);
  }

  // Serialización. Los importes salen como Number SOLO para display
  // (convención monetaria: jamás recalcular sobre estos números).
  private toDto(p: PaymentRow) {
    return {
      id: p.id,
      clientId: p.clientId,
      appointmentId: p.appointmentId,
      serviceId: p.serviceId,
      basePrice: Number(p.basePrice),
      vipDiscountAmount: Number(p.vipDiscountAmount),
      manualDiscountAmount: Number(p.manualDiscountAmount),
      finalPrice: Number(p.finalPrice),
      paymentMethod: p.paymentMethod,
      status: p.status,
      paidAt: p.paidAt,
      createdAt: p.createdAt,
    };
  }
}
