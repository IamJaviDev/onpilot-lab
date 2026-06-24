import { IsISO8601, Matches } from 'class-validator';

// Exige designador de zona explícito al final: 'Z' o '±HH:MM' (igual que
// CreateAppointmentDto): así el instante es inequívoco en UTC.
const TZ_OFFSET = /(Z|[+-]\d{2}:\d{2})$/;

export class CashSummaryQueryDto {
  // Límite inferior del rango sobre paidAt (inclusive). Obligatorio.
  @IsISO8601({ strict: true })
  @Matches(TZ_OFFSET, {
    message: 'from must include an explicit timezone offset (Z or ±HH:MM)',
  })
  from: string;

  // Límite superior del rango sobre paidAt (inclusive). Obligatorio.
  @IsISO8601({ strict: true })
  @Matches(TZ_OFFSET, {
    message: 'to must include an explicit timezone offset (Z or ±HH:MM)',
  })
  to: string;
}
