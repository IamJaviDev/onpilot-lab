import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Versión de la Graph API. Constante única: si Meta la deprecia, se cambia aquí.
const GRAPH_API_VERSION = 'v25.0';

// El webhook responde 200 antes de procesar, pero el envío no debe quedarse
// colgado indefinidamente reteniendo el event loop de procesamiento.
const SEND_TIMEOUT_MS = 10_000;

// Código de error de Meta: ventana de 24h cerrada (re-engagement). Fuera de la
// ventana de servicio solo se puede contactar con plantillas aprobadas; ese
// manejo es futuro. En esta tarea el caso solo se identifica y se loguea claro.
const META_ERROR_REENGAGEMENT_WINDOW = 131047;

/**
 * Error propio de envío. Expone el código/subcódigo del error de la Graph API
 * (si Meta llegó a responder) para que el llamante pueda distinguir casos sin
 * parsear mensajes de texto.
 */
export class WhatsAppSendError extends Error {
  constructor(
    message: string,
    readonly metaCode?: number,
    readonly metaSubcode?: number,
  ) {
    super(message);
    this.name = 'WhatsAppSendError';
  }

  /** Ventana de 24h cerrada: requiere plantilla de re-engagement (futuro). */
  get isReengagementWindowClosed(): boolean {
    return this.metaCode === META_ERROR_REENGAGEMENT_WINDOW;
  }
}

// Lo mínimo que se navega de la respuesta de la Graph API (éxito y error).
interface GraphSendResponse {
  messages?: Array<{ id?: string }>;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
}

/**
 * Adapter de envío de WhatsApp Cloud API. ÚNICA pieza del sistema que habla
 * con la Graph API de Meta para enviar; el resto del backend solo conoce su
 * interfaz (to, body) → wamid. Es la capa intercambiable del diseño multicanal:
 * sin Prisma, sin conversaciones, sin negocio — solo HTTP contra Meta.
 */
@Injectable()
export class WhatsAppAdapter {
  private readonly logger = new Logger(WhatsAppAdapter.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Envía un mensaje de texto libre. `to` en el formato que Meta espera
   * (dígitos internacionales, con o sin '+').
   *
   * @returns el wamid asignado por Meta (`messages[0].id`).
   * @throws WhatsAppSendError si Meta devuelve error, la respuesta no trae
   *   wamid, o falla la red/timeout.
   */
  async sendText(to: string, body: string): Promise<{ waMessageId: string }> {
    const phoneNumberId = this.config.getOrThrow<string>(
      'WHATSAPP_PHONE_NUMBER_ID',
    );
    const accessToken = this.config.getOrThrow<string>('WHATSAPP_ACCESS_TOKEN');
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body },
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
    } catch (error) {
      // Red caída, DNS, timeout… Meta no llegó a responder.
      this.logger.error(
        `WhatsApp send failed before reaching Meta (network/timeout): ${String(error)}`,
      );
      throw new WhatsAppSendError(
        `WhatsApp send failed (network/timeout): ${String(error)}`,
      );
    }

    const payload = (await response.json().catch(() => undefined)) as
      | GraphSendResponse
      | undefined;

    if (!response.ok) {
      throw this.toSendError(response.status, payload);
    }

    const waMessageId = payload?.messages?.[0]?.id;
    if (!waMessageId) {
      this.logger.error(
        `WhatsApp send got HTTP ${response.status} but no wamid in response`,
      );
      throw new WhatsAppSendError(
        'WhatsApp send succeeded but response has no message id (wamid)',
      );
    }

    return { waMessageId };
  }

  /** Mapea un error HTTP de la Graph API a WhatsAppSendError con log claro. */
  private toSendError(
    httpStatus: number,
    payload: GraphSendResponse | undefined,
  ): WhatsAppSendError {
    const meta = payload?.error;
    const detail =
      `HTTP ${httpStatus}, code=${meta?.code ?? '?'}, ` +
      `subcode=${meta?.error_subcode ?? '?'}: ${meta?.message ?? '(no error body)'}`;

    if (meta?.code === META_ERROR_REENGAGEMENT_WINDOW) {
      // Ventana de 24h cerrada: el destinatario lleva >24h sin escribir. Solo
      // cabe una plantilla aprobada (re-engagement) — manejo futuro, no T3.
      this.logger.error(
        `WhatsApp send rejected: 24h customer service window closed (${detail}). ` +
          `Re-engagement requires an approved template (not implemented yet).`,
      );
    } else {
      this.logger.error(`WhatsApp send rejected by Meta (${detail})`);
    }

    return new WhatsAppSendError(
      `WhatsApp send rejected by Meta (${detail})`,
      meta?.code,
      meta?.error_subcode,
    );
  }
}
