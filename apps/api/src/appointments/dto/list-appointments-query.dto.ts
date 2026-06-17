import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { AppointmentStatus } from '../../generated/prisma/client';

export class ListAppointmentsQueryDto {
  // Límite inferior del rango sobre startsAt (inclusive).
  @IsOptional()
  @IsISO8601()
  from?: string;

  // Límite superior del rango sobre startsAt (inclusive).
  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @IsOptional()
  @IsUUID()
  clientId?: string;
}
