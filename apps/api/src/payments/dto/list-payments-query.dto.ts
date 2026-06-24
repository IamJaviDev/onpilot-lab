import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { PaymentMethod, PaymentStatus } from '../../generated/prisma/client';

export class ListPaymentsQueryDto {
  // Límite inferior del rango sobre paidAt (inclusive).
  @IsOptional()
  @IsISO8601()
  from?: string;

  // Límite superior del rango sobre paidAt (inclusive).
  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;
}
