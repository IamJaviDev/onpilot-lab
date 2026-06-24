import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import {
  AppointmentStatus,
  PaymentStatus,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Regla MVP de reactivación: última cita COMPLETED hace más de N días.
const REACTIVATE_DAYS = 60;
const TOP_SERVICES_LIMIT = 5;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async h1(businessId: string) {
    // 1. Límites de "hoy" y "este mes" en la zona del negocio (DST-aware).
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { timezone: true },
    });
    const zNow = DateTime.now().setZone(business.timezone);
    const todayStart = zNow.startOf('day').toJSDate();
    const todayEnd = zNow.endOf('day').toJSDate();
    const monthStart = zNow.startOf('month').toJSDate();
    const monthEnd = zNow.endOf('month').toJSDate();
    const now = new Date();
    const reactivateCutoff = zNow.minus({ days: REACTIVATE_DAYS }).toJSDate();

    const [
      todayAppointments,
      upcomingAppointments,
      todayAgg,
      monthAgg,
      newClientsThisMonth,
      topGroups,
      clientsToReactivate,
    ] = await Promise.all([
      // Carga del día: todas las citas con startsAt hoy menos las canceladas.
      this.prisma.appointment.count({
        where: {
          businessId,
          deletedAt: null,
          status: { not: AppointmentStatus.CANCELLED },
          startsAt: { gte: todayStart, lte: todayEnd },
        },
      }),
      // Próximas: activas y futuras, sin tope.
      this.prisma.appointment.count({
        where: {
          businessId,
          deletedAt: null,
          status: {
            in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED],
          },
          startsAt: { gt: now },
        },
      }),
      this.prisma.payment.aggregate({
        where: {
          businessId,
          status: PaymentStatus.PAID,
          paidAt: { gte: todayStart, lte: todayEnd },
        },
        _sum: { finalPrice: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          businessId,
          status: PaymentStatus.PAID,
          paidAt: { gte: monthStart, lte: monthEnd },
        },
        _sum: { finalPrice: true },
        _count: true,
      }),
      this.prisma.client.count({
        where: {
          businessId,
          deletedAt: null,
          createdAt: { gte: monthStart, lte: monthEnd },
        },
      }),
      this.prisma.payment.groupBy({
        by: ['serviceId'],
        where: {
          businessId,
          status: PaymentStatus.PAID,
          serviceId: { not: null },
          paidAt: { gte: monthStart, lte: monthEnd },
        },
        _sum: { finalPrice: true },
        _count: true,
        orderBy: { _sum: { finalPrice: 'desc' } },
        take: TOP_SERVICES_LIMIT,
      }),
      this.countClientsToReactivate(businessId, reactivateCutoff, now),
    ]);

    const todayRevenue = todayAgg._sum.finalPrice ?? new Prisma.Decimal(0);
    const monthRevenue = monthAgg._sum.finalPrice ?? new Prisma.Decimal(0);
    const monthCount = monthAgg._count;
    const averageTicket =
      monthCount === 0
        ? new Prisma.Decimal(0)
        : monthRevenue
            .div(monthCount)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

    // Nombres de servicio acotados al negocio; SIN filtrar deletedAt: un
    // servicio borrado conserva su nombre en KPIs históricos.
    const serviceIds = topGroups
      .map((g) => g.serviceId)
      .filter((id): id is string => id !== null);
    const services = await this.prisma.service.findMany({
      where: { id: { in: serviceIds }, businessId },
      select: { id: true, name: true },
    });
    const nameById = new Map(services.map((s) => [s.id, s.name]));
    const topServices = topGroups.map((g) => ({
      serviceId: g.serviceId,
      name: g.serviceId ? (nameById.get(g.serviceId) ?? null) : null,
      totalRevenue: Number(g._sum.finalPrice ?? 0),
      count: g._count,
    }));

    return {
      todayAppointments,
      upcomingAppointments,
      todayRevenue: Number(todayRevenue),
      monthRevenue: Number(monthRevenue),
      newClientsThisMonth,
      averageTicket: Number(averageTicket),
      topServices,
      clientsToReactivate,
    };
  }

  // Conteo de clientes candidatos a reactivación. Predicado set-based que
  // Prisma no expresa con claridad → $queryRaw parametrizado (cada subquery
  // filtra por businessId; sin interpolación de strings).
  private async countClientsToReactivate(
    businessId: string,
    cutoff: Date,
    now: Date,
  ): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM "Client" c
      WHERE c."businessId" = ${businessId}::uuid
        AND c."deletedAt" IS NULL
        AND c."isVip" = false
        AND (
          SELECT count(*) FROM "Appointment" a
          WHERE a."clientId" = c.id AND a."businessId" = ${businessId}::uuid
            AND a."deletedAt" IS NULL AND a.status = 'COMPLETED'
        ) >= 2
        AND (
          SELECT max(a."startsAt") FROM "Appointment" a
          WHERE a."clientId" = c.id AND a."businessId" = ${businessId}::uuid
            AND a."deletedAt" IS NULL AND a.status = 'COMPLETED'
        ) < ${cutoff}
        AND NOT EXISTS (
          SELECT 1 FROM "Appointment" a
          WHERE a."clientId" = c.id AND a."businessId" = ${businessId}::uuid
            AND a."deletedAt" IS NULL
            AND a.status IN ('SCHEDULED', 'CONFIRMED')
            AND a."startsAt" > ${now}
        );
    `;
    return Number(rows[0]?.count ?? 0);
  }
}
