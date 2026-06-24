import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class MarkPaymentErrorDto {
  // Obligatorio: el motivo es el sentido del endpoint.
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
