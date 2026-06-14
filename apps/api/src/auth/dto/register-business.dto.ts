import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { BusinessSector } from '../../generated/prisma/client';

export class RegisterBusinessDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  businessName: string;

  @IsEnum(BusinessSector)
  sector: BusinessSector;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  ownerName: string;

  @IsEmail()
  @MaxLength(254)
  email: string;

  // Longitud sobre complejidad: mínimo 10, sin reglas de mayúsculas/símbolos.
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password: string;
}
