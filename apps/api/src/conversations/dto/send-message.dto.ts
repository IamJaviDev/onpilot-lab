import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// Límite de longitud de un mensaje de texto de WhatsApp.
const WHATSAPP_TEXT_MAX = 4096;

export class SendMessageDto {
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty()
  @MaxLength(WHATSAPP_TEXT_MAX)
  body!: string;
}
