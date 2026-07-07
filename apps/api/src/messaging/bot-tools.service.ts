import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { DateTime } from 'luxon';
import {
  ACTIVE_STATUSES,
  AppointmentsService,
} from '../appointments/appointments.service';
import { ClientsService } from '../clients/clients.service';
import { AppointmentSource } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { computeFreeSlots, parseWeeklySchedule } from './availability.util';

// Máximo de huecos que se devuelven al modelo (no inflar tokens; si hay más,
// se indica con masHuecos para que el bot pueda ofrecer "y más").
const MAX_SLOTS_FOR_MODEL = 8;

/**
 * Definiciones de las tools del bot (schema tipado para la API de Anthropic).
 * Las descripciones instruyen al modelo; las reglas duras (confirmación
 * explícita, no inventar) viven además en el system prompt.
 */
export const BOT_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'consultar_disponibilidad',
    description:
      'Consulta los huecos LIBRES REALES de la agenda del negocio para un ' +
      'servicio en una fecha concreta. Es la única fuente de verdad sobre ' +
      'disponibilidad: úsala siempre antes de proponer horas.',
    input_schema: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description:
            'id del servicio, tal cual aparece en la lista de servicios del negocio',
        },
        fecha: {
          type: 'string',
          description:
            'Día a consultar en formato YYYY-MM-DD (zona horaria del negocio)',
        },
      },
      required: ['serviceId', 'fecha'],
    },
  },
  {
    name: 'crear_cita',
    description:
      'Crea una cita REAL en la agenda del negocio. Llamar SOLO después de ' +
      'que el cliente haya confirmado explícitamente servicio, fecha y hora ' +
      'concretos, y usando un hueco exacto devuelto por consultar_disponibilidad.',
    input_schema: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'id del servicio confirmado',
        },
        fechaHora: {
          type: 'string',
          description:
            'Hueco confirmado en formato YYYY-MM-DDTHH:mm, exactamente como ' +
            'lo devolvió consultar_disponibilidad',
        },
        nombreCliente: {
          type: 'string',
          description: 'Nombre del cliente para su ficha',
        },
      },
      required: ['serviceId', 'fechaHora', 'nombreCliente'],
    },
  },
];

/**
 * Contexto server-side de ejecución: el businessId sale SIEMPRE de la
 * conversación resuelta por el webhook — el modelo jamás lo ve ni lo elige.
 */
export interface BotToolContext {
  businessId: string;
  conversationId: string;
}

export interface BotToolOutcome {
  // JSON serializable que se devuelve al modelo como tool_result. Los errores
  // de negocio van como { error: "texto legible" } — nunca stack traces.
  result: Record<string, unknown>;
  // Para la metadata de auditoría del OUT (toolCalls: [{name, ok}]).
  ok: boolean;
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const FECHA_HORA_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * Ejecución server-side de las tools del bot (H2 T5). Multi-tenancy en cada
 * query (businessId del contexto); la creación reutiliza AppointmentsService
 * (validaciones H1 + protección de solape en transacción) y ClientsService
 * (cliente mínimo con teléfono único). Nunca lanza: todo fallo se convierte
 * en un { error } legible por el modelo.
 */
@Injectable()
export class BotToolsService {
  private readonly logger = new Logger(BotToolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly appointments: AppointmentsService,
    private readonly clients: ClientsService,
  ) {}

  async execute(
    context: BotToolContext,
    toolName: string,
    input: unknown,
  ): Promise<BotToolOutcome> {
    // DEBUG con el input crudo del modelo: sin esto, un input mal construido
    // (p. ej. fecha con año pasado) es invisible en el log (hallazgo T5).
    this.logger.debug(
      `Executing tool ${toolName} (conversationId=${context.conversationId}) ` +
        `input=${JSON.stringify(input)}`,
    );
    try {
      switch (toolName) {
        case 'consultar_disponibilidad':
          return await this.consultarDisponibilidad(context, input);
        case 'crear_cita':
          return await this.crearCita(context, input);
        default:
          this.logger.warn(`Unknown bot tool requested: ${toolName}`);
          return this.businessError(`Herramienta desconocida: ${toolName}`);
      }
    } catch (error) {
      // Red de seguridad: ningún fallo inesperado llega al modelo con detalle
      // interno ni rompe el bucle del engine.
      this.logger.error(
        `Bot tool ${toolName} failed unexpectedly`,
        error instanceof Error ? error.stack : String(error),
      );
      return this.businessError(
        'No he podido completar la operación por un error interno.',
      );
    }
  }

  private async consultarDisponibilidad(
    context: BotToolContext,
    rawInput: unknown,
  ): Promise<BotToolOutcome> {
    const input = rawInput as { serviceId?: unknown; fecha?: unknown };
    if (
      typeof input?.serviceId !== 'string' ||
      typeof input?.fecha !== 'string' ||
      !FECHA_RE.test(input.fecha)
    ) {
      return this.businessError(
        'Parámetros inválidos: se necesita serviceId y fecha en formato YYYY-MM-DD.',
      );
    }

    const business = await this.prisma.business.findFirst({
      where: { id: context.businessId, deletedAt: null },
      select: { timezone: true, weeklySchedule: true },
    });
    if (!business) return this.businessError('Negocio no disponible.');

    const service = await this.prisma.service.findFirst({
      where: {
        id: input.serviceId,
        businessId: context.businessId,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, name: true, durationMinutes: true },
    });
    if (!service) {
      return this.businessError(
        'Servicio no encontrado en la lista de este negocio.',
      );
    }

    const schedule = parseWeeklySchedule(business.weeklySchedule);
    if (!schedule) {
      if (business.weeklySchedule !== null) {
        this.logger.warn(
          `Invalid weeklySchedule Json for business ${context.businessId}`,
        );
      }
      return this.businessError(
        'El negocio no tiene horario configurado: no puedo consultar disponibilidad ahora mismo.',
      );
    }

    // Citas activas que intersectan el día local del negocio.
    const dayStart = DateTime.fromISO(input.fecha, { zone: business.timezone });
    if (!dayStart.isValid) {
      return this.businessError('Fecha inválida.');
    }

    // Defensa en profundidad (fix post-T5): una fecha pasada devolvería lista
    // vacía por el filtro de slots pasados y el bot diría "no hay huecos".
    // Error explícito → el modelo se autocorrige (típico: año equivocado).
    const todayStart = DateTime.now().setZone(business.timezone).startOf('day');
    if (dayStart < todayStart) {
      return this.businessError(
        `Esa fecha ya pasó (hoy es ${todayStart.toFormat('yyyy-MM-dd')}). ` +
          'Consulta una fecha de hoy en adelante.',
      );
    }

    // Día de la semana en español, calculado sobre la fecha local del negocio
    // (fix 2 post-T5: el modelo lo calculaba mal — "miércoles" por jueves).
    const diaSemana = dayStart.setLocale('es').toFormat('cccc');

    const dayEnd = dayStart.plus({ days: 1 });
    const appointments = await this.prisma.appointment.findMany({
      where: {
        businessId: context.businessId,
        deletedAt: null,
        status: { in: ACTIVE_STATUSES },
        startsAt: { lt: dayEnd.toJSDate() },
        endsAt: { gt: dayStart.toJSDate() },
      },
      select: { startsAt: true, endsAt: true },
    });

    const computed = computeFreeSlots({
      date: input.fecha,
      timezone: business.timezone,
      schedule,
      durationMinutes: service.durationMinutes,
      appointments,
      now: new Date(),
    });

    if (computed.kind === 'invalid_date') {
      return this.businessError('Fecha inválida.');
    }
    if (computed.kind === 'closed') {
      return {
        ok: true,
        result: {
          fecha: input.fecha,
          diaSemana,
          servicio: service.name,
          slots: [],
          motivo: 'El negocio está cerrado ese día.',
        },
      };
    }

    const slots = computed.slots.slice(0, MAX_SLOTS_FOR_MODEL);
    return {
      ok: true,
      result: {
        fecha: input.fecha,
        diaSemana,
        servicio: service.name,
        slots,
        masHuecos: computed.slots.length > MAX_SLOTS_FOR_MODEL,
        ...(slots.length === 0
          ? { motivo: 'No quedan huecos libres ese día.' }
          : {}),
      },
    };
  }

  private async crearCita(
    context: BotToolContext,
    rawInput: unknown,
  ): Promise<BotToolOutcome> {
    const input = rawInput as {
      serviceId?: unknown;
      fechaHora?: unknown;
      nombreCliente?: unknown;
    };
    const nombreCliente =
      typeof input?.nombreCliente === 'string'
        ? input.nombreCliente.trim()
        : '';
    if (
      typeof input?.serviceId !== 'string' ||
      typeof input?.fechaHora !== 'string' ||
      !FECHA_HORA_RE.test(input.fechaHora) ||
      nombreCliente.length === 0
    ) {
      return this.businessError(
        'Parámetros inválidos: se necesita serviceId, fechaHora (YYYY-MM-DDTHH:mm) y nombreCliente.',
      );
    }

    const business = await this.prisma.business.findFirst({
      where: { id: context.businessId, deletedAt: null },
      select: { timezone: true },
    });
    if (!business) return this.businessError('Negocio no disponible.');

    // La hora llega en local del negocio (formato de los slots) → instante.
    const startsAt = DateTime.fromISO(input.fechaHora, {
      zone: business.timezone,
    });
    if (!startsAt.isValid) return this.businessError('Fecha y hora inválidas.');

    const client = await this.resolveClient(context, nombreCliente);
    if ('error' in client) return this.businessError(client.error);

    // Fix 4 post-T5: el Client se resuelve por teléfono (correcto por diseño),
    // pero la reserva puede ser para un tercero ("Iván" desde el móvil de
    // "javier"). Si el nombre dado difiere del Client (comparación laxa), se
    // conserva en las notas de la cita para que el negocio sepa a nombre de
    // quién es. Soporte real multi-persona por teléfono: deuda de producto.
    const isThirdPartyName =
      client.name.trim().toLowerCase() !== nombreCliente.toLowerCase();
    const notes = isThirdPartyName
      ? `Reserva a nombre de: ${nombreCliente} (vía WhatsApp)`
      : undefined;

    try {
      const appointment = await this.appointments.create(
        context.businessId,
        null,
        {
          clientId: client.id,
          serviceId: input.serviceId,
          startsAt: startsAt.toUTC().toISO(),
          notes,
        },
        AppointmentSource.WHATSAPP,
      );

      const localStart = DateTime.fromJSDate(appointment.startsAt).setZone(
        business.timezone,
      );
      return {
        ok: true,
        result: {
          creada: true,
          cita: {
            servicio: appointment.service.name,
            fecha: localStart.toFormat('yyyy-MM-dd'),
            hora: localStart.toFormat('HH:mm'),
            // El nombre DADO en conversación (puede ser un tercero), no el
            // del Client resuelto por teléfono: es el que el bot confirma.
            nombreCliente,
          },
        },
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        // La carrera real: el hueco se ocupó entre la consulta y la
        // confirmación. La transacción de AppointmentsService garantiza que
        // NO se creó nada.
        return this.businessError(
          'Ese hueco acaba de ocuparse y ya no está disponible. Consulta la disponibilidad de nuevo y ofrece otra hora.',
        );
      }
      if (error instanceof BadRequestException) {
        // Validación de negocio de H1 (servicio inactivo, hora en pasado…):
        // mensaje controlado, sin stack.
        return this.businessError(
          `No se pudo crear la cita: ${error.message}.`,
        );
      }
      throw error; // inesperado → red de seguridad de execute()
    }
  }

  /**
   * Resuelve el cliente de la conversación: clientId ya vinculado → ese;
   * si no, Client activo por teléfono (E.164 de la conversación); si no,
   * se crea mínimo {nombre, phone} y se vincula a la conversación.
   */
  private async resolveClient(
    context: BotToolContext,
    nombreCliente: string,
  ): Promise<{ id: string; name: string } | { error: string }> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: context.conversationId, businessId: context.businessId },
      select: { clientId: true, phone: true },
    });
    if (!conversation) return { error: 'Conversación no disponible.' };

    if (conversation.clientId) {
      const linked = await this.prisma.client.findFirst({
        where: {
          id: conversation.clientId,
          businessId: context.businessId,
          deletedAt: null,
        },
        select: { id: true, name: true },
      });
      if (linked) return linked;
      // Cliente vinculado borrado: se sigue el flujo de teléfono/creación.
    }

    const byPhone = await this.prisma.client.findFirst({
      where: {
        businessId: context.businessId,
        phone: conversation.phone,
        deletedAt: null,
      },
      select: { id: true, name: true },
    });

    const client =
      byPhone ??
      (await this.clients.create(context.businessId, {
        name: nombreCliente,
        phone: conversation.phone,
      }));

    // Vincular la conversación al cliente (multi-tenant: id + businessId).
    await this.prisma.conversation.updateMany({
      where: { id: context.conversationId, businessId: context.businessId },
      data: { clientId: client.id },
    });

    return { id: client.id, name: client.name };
  }

  private businessError(message: string): BotToolOutcome {
    return { ok: false, result: { error: message } };
  }
}
