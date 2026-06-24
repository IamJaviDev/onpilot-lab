import { IsEnum, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';
import { PaymentMethod } from '../../generated/prisma/client';

export class CreatePaymentDto {
  @IsUUID()
  clientId: string;

  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @IsOptional()
  @IsUUID()
  serviceId?: string;

  // Descuento manual que introduce el profesional. Importe, no porcentaje.
  // Se convierte a Prisma.Decimal en el servicio (cero aritmética de number).
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  manualDiscountAmount?: number;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;
}
