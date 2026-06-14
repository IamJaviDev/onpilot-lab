import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone?: string;

  // null para limpiar el email.
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  // null para limpiar las notas.
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
