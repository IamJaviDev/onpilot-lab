import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { DateTime } from 'luxon';
import { ACTIVE_STATUSES } from '../appointments/appointments.service';
import { ConversationStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  REMINDERS_QUEUE,
  ReminderJobData,
} from '../reminders/reminders.service';
import { THIRD_PARTY_NOTE_RE } from './bot-tools.service';
import { ConversationService } from './conversation.service';
import { normalizePhone } from './phone.util';
import { WhatsAppAdapter, WhatsAppSendError } from './whatsapp.adapter';

/**
 * Processor de la cola de recordatorios (H2 T7). Vive en messaging (no en
 * reminders) porque componer y enviar un WhatsApp ES mensajería: necesita el
 * adapter y ConversationService, y ponerlo aquí evita el ciclo de módulos
 * Messaging → Appointments → Reminders → Messaging.
 *
 * El job puede tener días; el mundo cambió desde que se programó. Por eso lo
 * primero es RELEER la cita de BD y descartar con log si ya no procede:
 * inexistente, no activa, fecha cambiada (job huérfano) o ya pasada. Después,
 * si la conversación del teléfono está intervenida (HUMAN_CONTROL /
 * PENDING_REVIEW), tampoco se envía: el equipo está al mando y un mensaje
 * automático en medio sería una intrusión.
 *
 * La respuesta del cliente al recordatorio la gestiona el bot de T5/T6 por el
 * flujo normal del webhook — aquí solo sale el OUT programado.
 */
@Injectable()
@Processor(REMINDERS_QUEUE)
export class ReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(ReminderProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppAdapter,
    private readonly conversations: ConversationService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job<ReminderJobData>): Promise<void> {
    // Flag estricto también aquí: cubre jobs encolados antes de apagarlo.
    if (this.config.get<string>('REMINDERS_ENABLED') !== 'true') {
      this.logger.log(
        `Reminder discarded, REMINDERS_ENABLED is off (appointmentId=${job.data.appointmentId})`,
      );
      return;
    }

    const { businessId, appointmentId } = job.data;

    // Releer SIEMPRE por id + businessId (payload del job, regla del proyecto).
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, businessId, deletedAt: null },
      select: {
        id: true,
        clientId: true,
        startsAt: true,
        status: true,
        notes: true,
        client: { select: { name: true, phone: true } },
        service: { select: { name: true } },
        business: { select: { name: true, timezone: true } },
      },
    });

    if (!appointment) {
      this.logger.log(
        `Reminder discarded, appointment not found (appointmentId=${appointmentId})`,
      );
      return;
    }
    if (!ACTIVE_STATUSES.includes(appointment.status)) {
      this.logger.log(
        `Reminder discarded, appointment no longer active ` +
          `(appointmentId=${appointmentId}, status=${appointment.status})`,
      );
      return;
    }
    if (appointment.startsAt.toISOString() !== job.data.startsAt) {
      // Job huérfano: la cita cambió de fecha y este job escapó a la limpieza
      // remove+add (p. ej. Redis caído justo al reprogramar).
      this.logger.log(
        `Reminder discarded, startsAt changed since scheduling ` +
          `(appointmentId=${appointmentId}, scheduled=${job.data.startsAt}, ` +
          `current=${appointment.startsAt.toISOString()})`,
      );
      return;
    }
    if (appointment.startsAt.getTime() <= Date.now()) {
      this.logger.log(
        `Reminder discarded, appointment already started (appointmentId=${appointmentId})`,
      );
      return;
    }

    // Estado de la conversación del teléfono (E.164, como Conversation.phone).
    // OJO deuda conocida: si H1 guardó el teléfono en formato local, aquí no
    // casará con la conversación real y el envío fallará contra Meta — se
    // loguea y muere en los reintentos (normalización H1↔E.164, devlog).
    const phone = normalizePhone(appointment.client.phone);
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        businessId,
        phone,
        status: { not: ConversationStatus.CLOSED },
        deletedAt: null,
      },
      select: { id: true, status: true },
    });
    if (conversation && conversation.status !== ConversationStatus.BOT_ACTIVE) {
      this.logger.log(
        `Reminder discarded, conversation under human control ` +
          `(appointmentId=${appointmentId}, status=${conversation.status})`,
      );
      return;
    }

    // Cliente de la web que nunca escribió: se crea su conversación
    // (BOT_ACTIVE, vinculada al Client de la cita) — mismo patrón que
    // persistIncoming: buscar la no-CLOSED antes de crear (unicidad).
    const conversationId =
      conversation?.id ??
      (
        await this.prisma.conversation.create({
          data: {
            businessId,
            clientId: appointment.clientId,
            phone,
            status: ConversationStatus.BOT_ACTIVE,
          },
          select: { id: true },
        })
      ).id;

    const body = composeReminder({
      clientName: appointment.client.name,
      businessName: appointment.business.name,
      serviceName: appointment.service.name,
      startsAt: appointment.startsAt,
      timezone: appointment.business.timezone,
      thirdPartyName: appointment.notes?.match(THIRD_PARTY_NOTE_RE)?.[1],
    });

    try {
      const { waMessageId } = await this.whatsapp.sendText(phone, body);
      await this.conversations.persistOutgoing({
        businessId,
        conversationId,
        body,
        waMessageId,
        metadata: { reminder: true, appointmentId },
      });
      this.logger.log(`Reminder sent (appointmentId=${appointmentId})`);
    } catch (error) {
      if (
        error instanceof WhatsAppSendError &&
        error.isReengagementWindowClosed
      ) {
        // Ventana de 24h cerrada (131047): reintentar no la abre. Job
        // completado-con-fallo. La solución real es una plantilla HSM
        // aprobada — deuda DESTACADA pre-lanzamiento.
        this.logger.warn(
          `Reminder not delivered: 24h window closed, needs an approved HSM ` +
            `template (appointmentId=${appointmentId})`,
        );
        return;
      }
      // Otros errores (red, token, 5xx…): a los reintentos de BullMQ.
      throw error;
    }
  }
}

/**
 * Texto del recordatorio (v1, texto libre — la plantilla HSM es deuda).
 * "de mañana" solo si de verdad es mañana en el timezone del negocio: un job
 * que dispara tarde (Redis caído horas) o un lead de prueba pueden caer en
 * hoy u otro día — la referencia temporal no debe mentir.
 */
export function composeReminder(input: {
  clientName: string;
  businessName: string;
  serviceName: string;
  startsAt: Date;
  timezone: string;
  thirdPartyName?: string;
}): string {
  const local = DateTime.fromJSDate(input.startsAt)
    .setZone(input.timezone)
    .setLocale('es');
  const diaSemana = local.toFormat('cccc');
  const fecha = local.toFormat('dd/MM');
  const hora = local.toFormat('HH:mm');

  const today = DateTime.now().setZone(input.timezone).startOf('day');
  const daysAway = local.startOf('day').diff(today, 'days').days;
  const cuando =
    daysAway === 0
      ? 'de hoy'
      : daysAway === 1
        ? 'de mañana'
        : `del ${diaSemana}`;

  const aNombreDe = input.thirdPartyName
    ? ` (a nombre de ${input.thirdPartyName})`
    : '';

  return (
    `👋 Hola, ${input.clientName}! Te recordamos tu cita ${cuando} en ` +
    `${input.businessName}: *${input.serviceName}${aNombreDe}, ${diaSemana} ` +
    `${fecha} a las ${hora}*. Si necesitas cambiarla o cancelarla, ` +
    `respóndeme por aquí. 😊`
  );
}
