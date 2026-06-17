import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

// Exige designador de zona explícito al final: 'Z' o '±HH:MM'.
const TZ_OFFSET = /(Z|[+-]\d{2}:\d{2})$/;

// clientId es inmutable: una cita no se reasigna a otro cliente vía PATCH.
export class UpdateAppointmentDto {
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(TZ_OFFSET, {
    message: 'startsAt must include an explicit timezone offset (Z or ±HH:MM)',
  })
  startsAt?: string;

  // null para limpiar las notas.
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
