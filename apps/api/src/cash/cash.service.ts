import { BadRequestException, Injectable } from '@nestjs/common';
import { PaymentStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CashSummaryQueryDto } from './dto/cash-summary-query.dto';

const TOP_SERVICES_LIMIT = 5;

@Injectable()
export class CashService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(businessId: string, query: CashSummaryQueryDto) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (from > to) {
      throw new BadRequestException('from must be before to');
    }

    // Cobros válidos del negocio en el rango: solo PAID cuenta para facturación.
    const paidWhere: Prisma.PaymentWhereInput = {
      businessId,
      status: PaymentStatus.PAID,
      paidAt: { gte: from, lte: to },
    };

    // 1. Totales (Decimal).
    const totals = await this.prisma.payment.aggregate({
      where: paidWhere,
      _sum: { finalPrice: true },
      _count: true,
    });
    const totalRevenue = totals._sum.finalPrice ?? new Prisma.Decimal(0);
    const paymentsCount = totals._count;

    // 2. Ticket medio (Decimal, con guard de división por cero).
    const averageTicket =
      paymentsCount === 0
        ? new Prisma.Decimal(0)
        : totalRevenue
            .div(paymentsCount)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

    // 3. Desglose por método de pago (solo métodos presentes).
    const byMethod = await this.prisma.payment.groupBy({
      by: ['paymentMethod'],
      where: paidWhere,
      _sum: { finalPrice: true },
      _count: true,
      orderBy: { _sum: { finalPrice: 'desc' } },
    });
    const byPaymentMethod = byMethod.map((g) => ({
      paymentMethod: g.paymentMethod,
      total: Number(g._sum.finalPrice ?? 0),
      count: g._count,
    }));

    // 4. Top servicios por facturación (cobros sin servicio quedan fuera).
    const topGroups = await this.prisma.payment.groupBy({
      by: ['serviceId'],
      where: { ...paidWhere, serviceId: { not: null } },
      _sum: { finalPrice: true },
      _count: true,
      orderBy: { _sum: { finalPrice: 'desc' } },
      take: TOP_SERVICES_LIMIT,
    });
    const serviceIds = topGroups
      .map((g) => g.serviceId)
      .filter((id): id is string => id !== null);
    // Nombres acotados al negocio; SIN filtrar deletedAt: un servicio borrado
    // debe conservar su nombre en la caja histórica.
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

    // 5. Cobros marcados como error en el rango (solo conteo).
    const errorsCount = await this.prisma.payment.count({
      where: {
        businessId,
        status: PaymentStatus.ERROR,
        paidAt: { gte: from, lte: to },
      },
    });

    return {
      totalRevenue: Number(totalRevenue),
      paymentsCount,
      averageTicket: Number(averageTicket),
      byPaymentMethod,
      topServices,
      errorsCount,
    };
  }
}
