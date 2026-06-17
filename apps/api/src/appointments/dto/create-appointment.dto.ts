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

export class CreateAppointmentDto {
  @IsUUID()
  clientId: string;

  @IsUUID()
  serviceId: string;

  // startsAt debe ser un instante ISO-8601 con offset de zona OBLIGATORIO.
  // Sin zona → 400: así el instante es inequívoco y la comparación con now()
  // en UTC es correcta. Si el día de mañana el frontend manda hora local,
  // entrará Business.timezone para interpretarla (deuda documentada).
  @IsISO8601({ strict: true })
  @Matches(TZ_OFFSET, {
    message: 'startsAt must include an explicit timezone offset (Z or ±HH:MM)',
  })
  startsAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
