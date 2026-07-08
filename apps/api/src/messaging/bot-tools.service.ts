import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { DateTime } from 'luxon';
import {
  ACTIVE_STATUSES,
  AppointmentsService,
} from '../appointments/appointments.service';
import { ClientsService } from '../clients/clients.service';
import {
  AppointmentSource,
  ConversationStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { computeFreeSlots, parseWeeklySchedule } from './availability.util';

// Máximo de huecos que se devuelven al modelo (no inflar tokens; si hay más,
// se indica con masHuecos para que el bot pueda ofrecer "y más").
const MAX_SLOTS_FOR_MODEL = 8;

// Máximo de citas del cliente que se devuelven al modelo (SPEC T6: ~5).
const MAX_APPOINTMENTS_FOR_MODEL = 5;

// Motivos de escalado (docs/09: triggers). Se persisten en la metadata del
// Message OUT para auditar POR QUÉ escaló el bot.
export const ESCALATION_MOTIVOS = [
  'PIDE_HUMANO',
  'FRUSTRACION',
  'URGENCIA',
  'NO_PUEDO_RESOLVER',
  'FUERA_DE_SCOPE',
] as const;
export type EscalationMotivo = (typeof ESCALATION_MOTIVOS)[number];

// Error ÚNICO e indistinguible de cancelar_cita para cita ajena / pasada /
// inactiva / de otro negocio: los cuatro casos caen en el mismo findFirst
// filtrado, y el texto no puede filtrar cuál fue (regla de identidad T6).
const CANCEL_NOT_FOUND_ERROR =
  'No encuentro esa cita entre las citas futuras activas de este teléfono.';

// Nota que crear_cita deja cuando la reserva es para un tercero (T5);
// listar_mis_citas la parsea para devolver "a nombre de". Exportada (T7):
// el recordatorio incluye el mismo "a nombre de" si la cita lo tiene.
export const THIRD_PARTY_NOTE_RE =
  /^Reserva a nombre de: (.+) \(vía WhatsApp\)$/;

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
  {
    name: 'listar_mis_citas',
    description:
      'Lista las citas FUTURAS activas del cliente de esta conversación ' +
      '(identificado por su teléfono). Úsala antes de cancelar o cambiar ' +
      'una cita, para identificarla con su appointmentId real.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'cancelar_cita',
    description:
      'Cancela una cita del cliente de esta conversación. Llamar SOLO tras ' +
      'la confirmación explícita del cliente, y con el appointmentId EXACTO ' +
      '(UUID completo) devuelto por listar_mis_citas en esta misma gestión — ' +
      'JAMÁS el número de orden del listado ni un id abreviado o inventado.',
    input_schema: {
      type: 'object',
      properties: {
        appointmentId: {
          type: 'string',
          description:
            'appointmentId EXACTO (UUID completo) tal cual lo devolvió ' +
            'listar_mis_citas',
        },
      },
      required: ['appointmentId'],
    },
  },
  {
    name: 'escalar_a_humano',
    description:
      'Pasa la conversación al equipo humano del negocio: el bot deja de ' +
      'responder hasta que una persona la revise. Llamar cuando el cliente ' +
      'pide una persona, hay frustración o urgencia, no puedes resolver, o ' +
      'la petición está fuera de tus capacidades. Tras el éxito, despídete ' +
      'indicando que el equipo le responderá aquí mismo.',
    input_schema: {
      type: 'object',
      properties: {
        motivo: {
          type: 'string',
          enum: [...ESCALATION_MOTIVOS],
          description: 'Motivo del escalado',
        },
      },
      required: ['motivo'],
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

// FIX 3 post-T6: las columnas de id son @db.Uuid — un id malformado del
// modelo (visto en vivo: appointmentId "4", el ordinal del listado) revienta
// en Prisma con P2023. TODO input de id se valida en forma ANTES de cualquier
// query, con error legible que permita al modelo autocorregirse (re-listar).
const UUID_SHAPE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const INVALID_APPOINTMENT_ID_ERROR =
  'appointmentId inválido: usa el identificador EXACTO (UUID completo) que ' +
  'devolvió listar_mis_citas, nunca el número de orden. Vuelve a llamar a ' +
  'listar_mis_citas si no lo tienes.';

const INVALID_SERVICE_ID_ERROR =
  'serviceId inválido: usa el id EXACTO (UUID completo) de la lista de ' +
  'servicios del negocio.';

/**
 * Ejecución server-side de las tools del bot (H2 T5 + T6). Multi-tenancy en
 * cada query (businessId del contexto); crear/cancelar reutilizan
 * AppointmentsService (validaciones H1, solape en transacción, soft-cancel) y
 * ClientsService (cliente mínimo con teléfono único). Las tools sobre citas
 * existentes aplican además la regla de identidad T6: solo citas de los
 * Client del teléfono de la conversación. Nunca lanza: todo fallo se
 * convierte en un { error } legible por el modelo.
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
        case 'listar_mis_citas':
          return await this.listarMisCitas(context);
        case 'cancelar_cita':
          return await this.cancelarCita(context, input);
        case 'escalar_a_humano':
          return await this.escalarAHumano(context, input);
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
    if (!UUID_SHAPE_RE.test(input.serviceId)) {
      return this.businessError(INVALID_SERVICE_ID_ERROR);
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
    if (!UUID_SHAPE_RE.test(input.serviceId)) {
      return this.businessError(INVALID_SERVICE_ID_ERROR);
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

    // Defensa en profundidad (fix del reloj): el modelo puede construir una
    // hora ya pasada del día de hoy (alucinando la hora desde el historial).
    // assertNotPast de H1 es el backstop, pero aquí el error es localizado y
    // accionable —le damos la hora actual para que se autocorrija— y corta
    // antes de crear cliente o entrar en la transacción.
    const now = DateTime.now().setZone(business.timezone);
    if (startsAt <= now) {
      return this.businessError(
        `Esa hora ya pasó: ahora son las ${now.toFormat('HH:mm')}. Ofrece un hueco futuro.`,
      );
    }

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
   * Citas FUTURAS activas del cliente del teléfono de la conversación (regla
   * de identidad T6: la búsqueda parte SIEMPRE de los Client resueltos por
   * (businessId, phone) — nadie lista citas de otro dando un nombre).
   */
  private async listarMisCitas(
    context: BotToolContext,
  ): Promise<BotToolOutcome> {
    const business = await this.prisma.business.findFirst({
      where: { id: context.businessId, deletedAt: null },
      select: { timezone: true },
    });
    if (!business) return this.businessError('Negocio no disponible.');

    const resolved = await this.resolveClientIdsForPhone(context);
    if ('error' in resolved) return this.businessError(resolved.error);

    const rows =
      resolved.ids.length === 0
        ? []
        : await this.prisma.appointment.findMany({
            where: {
              businessId: context.businessId,
              clientId: { in: resolved.ids },
              deletedAt: null,
              status: { in: ACTIVE_STATUSES },
              startsAt: { gt: new Date() },
            },
            orderBy: { startsAt: 'asc' },
            take: MAX_APPOINTMENTS_FOR_MODEL + 1,
            select: {
              id: true,
              startsAt: true,
              notes: true,
              service: { select: { name: true } },
            },
          });

    const hayMas = rows.length > MAX_APPOINTMENTS_FOR_MODEL;
    const citas = rows.slice(0, MAX_APPOINTMENTS_FOR_MODEL).map((row) => {
      const local = DateTime.fromJSDate(row.startsAt).setZone(
        business.timezone,
      );
      const aNombreDe = row.notes?.match(THIRD_PARTY_NOTE_RE)?.[1];
      return {
        appointmentId: row.id,
        servicio: row.service.name,
        fecha: local.toFormat('yyyy-MM-dd'),
        hora: local.toFormat('HH:mm'),
        diaSemana: local.setLocale('es').toFormat('cccc'),
        ...(aNombreDe ? { aNombreDe } : {}),
      };
    });

    return {
      ok: true,
      result: {
        citas,
        hayMas,
        ...(citas.length === 0
          ? { motivo: 'No hay citas futuras activas para este teléfono.' }
          : {
              // FIX 2 post-T6: instrucción en el punto de uso — en vivo el
              // modelo mandó a cancelar_cita el ordinal del listado ("4").
              aviso:
                'Para cancelar_cita usa el appointmentId EXACTO (UUID completo), nunca el número de orden.',
            }),
      },
    };
  }

  /**
   * Cancela una cita del cliente del teléfono. Defensa dura ANTES de tocar
   * nada: la cita debe pertenecer a un Client del teléfono, ser futura y
   * activa; si no, el error es ÚNICO e indistinguible (ajena / pasada /
   * inactiva / de otro negocio devuelven el mismo texto, sin filtrar cuál).
   * La cancelación en sí reutiliza AppointmentsService.cancel de H1 (soft,
   * status CANCELLED, jamás delete).
   */
  private async cancelarCita(
    context: BotToolContext,
    rawInput: unknown,
  ): Promise<BotToolOutcome> {
    const input = rawInput as { appointmentId?: unknown };
    const appointmentId =
      typeof input?.appointmentId === 'string'
        ? input.appointmentId.trim()
        : '';
    // FIX 3: forma UUID validada ANTES de cualquier query (visto en vivo:
    // el modelo mandó el ordinal "4" → P2023 de Prisma → error opaco). El
    // mensaje guía la autocorrección: re-listar y usar el id exacto.
    if (!UUID_SHAPE_RE.test(appointmentId)) {
      return this.businessError(INVALID_APPOINTMENT_ID_ERROR);
    }

    const business = await this.prisma.business.findFirst({
      where: { id: context.businessId, deletedAt: null },
      select: { timezone: true },
    });
    if (!business) return this.businessError('Negocio no disponible.');

    const resolved = await this.resolveClientIdsForPhone(context);
    if ('error' in resolved) return this.businessError(resolved.error);
    if (resolved.ids.length === 0) {
      return this.businessError(CANCEL_NOT_FOUND_ERROR);
    }

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        businessId: context.businessId,
        clientId: { in: resolved.ids },
        deletedAt: null,
        status: { in: ACTIVE_STATUSES },
        startsAt: { gt: new Date() },
      },
      select: {
        id: true,
        startsAt: true,
        service: { select: { name: true } },
      },
    });
    if (!appointment) return this.businessError(CANCEL_NOT_FOUND_ERROR);

    try {
      await this.appointments.cancel(context.businessId, appointment.id, {
        reason: 'Cancelada por el cliente vía WhatsApp',
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        // Carrera: la cita cambió entre la verificación y la cancelación
        // (p. ej. el negocio la completó/canceló a la vez).
        return this.businessError(
          'Esa cita acaba de cambiar y ya no se puede cancelar. Consulta tus citas de nuevo con listar_mis_citas.',
        );
      }
      throw error; // inesperado → red de seguridad de execute()
    }

    const local = DateTime.fromJSDate(appointment.startsAt).setZone(
      business.timezone,
    );
    return {
      ok: true,
      result: {
        cancelada: true,
        cita: {
          servicio: appointment.service.name,
          fecha: local.toFormat('yyyy-MM-dd'),
          hora: local.toFormat('HH:mm'),
        },
      },
    };
  }

  /**
   * Escalado real (T6): transición de la conversación a PENDING_REVIEW. Tras
   * esto el guard de estados de T3 garantiza que el siguiente IN no dispara
   * al bot. El motivo viaja al modelo solo como eco; la auditoría real la
   * escribe el BotEngine en la metadata del Message OUT.
   */
  private async escalarAHumano(
    context: BotToolContext,
    rawInput: unknown,
  ): Promise<BotToolOutcome> {
    const input = rawInput as { motivo?: unknown };
    const motivo = ESCALATION_MOTIVOS.find((m) => m === input?.motivo);
    if (!motivo) {
      return this.businessError(
        `Parámetros inválidos: motivo debe ser uno de ${ESCALATION_MOTIVOS.join(', ')}.`,
      );
    }

    const escalated = await this.transitionToPendingReview(context);
    if (!escalated) return this.businessError('Conversación no disponible.');

    return { ok: true, result: { escalado: true, motivo } };
  }

  /**
   * ÚNICA ruta de escritura de Conversation.status desde el bot (SPEC T6):
   * BOT_ACTIVE → PENDING_REVIEW. La usan la tool escalar_a_humano y el
   * BotEngine cuando un fallback promete "aviso al equipo" (opción A: si se
   * dice, se hace). La vuelta PENDING_REVIEW → BOT_ACTIVE es manual, fuera
   * del bot. Nunca lanza: false = no se pudo escalar (el llamante loguea).
   */
  async transitionToPendingReview(context: BotToolContext): Promise<boolean> {
    try {
      const result = await this.prisma.conversation.updateMany({
        where: { id: context.conversationId, businessId: context.businessId },
        data: { status: ConversationStatus.PENDING_REVIEW },
      });
      return result.count > 0;
    } catch (error) {
      this.logger.error(
        `transitionToPendingReview failed (conversationId=${context.conversationId})`,
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }

  /**
   * Identidad por teléfono (T6): todos los Client activos del negocio con el
   * teléfono E.164 de la conversación, más el clientId ya vinculado si sigue
   * activo (también derivado de teléfono; cubre el desfase de normalización
   * H1↔E.164 del devlog). El modelo jamás elige el cliente.
   */
  private async resolveClientIdsForPhone(
    context: BotToolContext,
  ): Promise<{ ids: string[] } | { error: string }> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: context.conversationId, businessId: context.businessId },
      select: { clientId: true, phone: true },
    });
    if (!conversation) return { error: 'Conversación no disponible.' };

    const byPhone = await this.prisma.client.findMany({
      where: {
        businessId: context.businessId,
        phone: conversation.phone,
        deletedAt: null,
      },
      select: { id: true },
    });

    const ids = new Set(byPhone.map((c) => c.id));
    if (conversation.clientId && !ids.has(conversation.clientId)) {
      const linked = await this.prisma.client.findFirst({
        where: {
          id: conversation.clientId,
          businessId: context.businessId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (linked) ids.add(linked.id);
    }
    return { ids: [...ids] };
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
