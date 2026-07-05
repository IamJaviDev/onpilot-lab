import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { WebhookService } from './webhook.service';
import type { WhatsAppWebhookPayload } from './whatsapp-payload.types';

/**
 * Webhook de WhatsApp Cloud API.
 *
 * NO lleva JwtAuthGuard a propósito: Meta no envía nuestro JWT. La autenticidad
 * se garantiza por la firma HMAC del cuerpo (`X-Hub-Signature-256`) con el App
 * Secret — ver WebhookService.verifySignature. Es la única ruta del backend que
 * se protege por firma en vez de por sesión.
 */
@Controller('webhooks/whatsapp')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly webhook: WebhookService) {}

  /**
   * Verificación del webhook (hub challenge). Meta llama con hub.mode=subscribe,
   * hub.verify_token y hub.challenge al configurar la callback URL.
   */
  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    if (mode === 'subscribe' && token === this.webhook.verifyToken) {
      return challenge;
    }
    throw new ForbiddenException();
  }

  /**
   * Recepción de notificaciones. Responde 200 rápido e incondicional tras
   * validar la firma; Meta reintenta si no recibe 200 pronto.
   */
  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: true }> {
    const rawBody = req.rawBody;
    if (!rawBody) {
      // Con rawBody:true en el bootstrap esto no debería ocurrir; si ocurre,
      // algo está mal en la configuración y no podemos verificar la firma.
      throw new BadRequestException('Missing raw body');
    }

    const header = req.headers['x-hub-signature-256'];
    const signature = typeof header === 'string' ? header : undefined;
    if (!this.webhook.verifySignature(rawBody, signature)) {
      throw new UnauthorizedException('Invalid signature');
    }

    // Firma OK. A partir de aquí, 200 SIEMPRE: un fallo nuestro de parseo o
    // persistencia no debe provocar una tormenta de reintentos de Meta. Se
    // loguea y se responde 200 igualmente.
    try {
      const payload = JSON.parse(
        rawBody.toString('utf8'),
      ) as WhatsAppWebhookPayload;
      await this.webhook.handleIncoming(payload);
    } catch (error) {
      this.logger.error('Error processing WhatsApp webhook', error as Error);
    }

    return { received: true };
  }
}
