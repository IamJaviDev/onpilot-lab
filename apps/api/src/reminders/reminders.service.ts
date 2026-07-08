import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

/** Nombre de la cola. Lo comparten este scheduler y el processor (messaging). */
export const REMINDERS_QUEUE = 'appointment-reminders';

// Antelación del recordatorio. Constante en MVP; pasará al futuro BotConfig
// cuando exista configuración por negocio.
const REMINDER_LEAD_HOURS = 24;

// Reintentos de BullMQ ante errores transitorios del processor (red, 5xx de
// Meta…). El 131047 (ventana de 24h cerrada) NO llega aquí: el processor lo
// trata como completado-con-fallo porque reintentar no abre la ventana.
const JOB_ATTEMPTS = 3;
const JOB_BACKOFF_MS = 60_000;

/** Lo mínimo de una cita que necesita la programación del recordatorio. */
export interface ReminderAppointment {
  id: string;
  businessId: string;
  startsAt: Date;
}

/**
 * Payload del job. businessId SIEMPRE incluido (regla de jobs del proyecto);
 * startsAt en ISO para que el processor descarte jobs huérfanos cuya cita
 * cambió de fecha (defensa extra a la limpieza remove+add).
 */
export interface ReminderJobData {
  businessId: string;
  appointmentId: string;
  startsAt: string;
}

/**
 * Programación de recordatorios de cita (H2 T7). Un job por cita con jobId
 * determinista = appointmentId (clave para cancelarlo/reprogramarlo desde
 * cualquier origen: web, bot, reprogramación T6 = cancel+create).
 *
 * Contrato: los tres métodos JAMÁS lanzan. El recordatorio es best-effort —
 * un Redis caído se loguea como ERROR y la operación de la cita sigue intacta
 * (mismo patrón que transitionToPendingReview en T6). La conexión lleva
 * enableOfflineQueue: false para que el fallo sea inmediato, no un await
 * colgado esperando reconexión.
 */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    @InjectQueue(REMINDERS_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService,
  ) {}

  async schedule(appointment: ReminderAppointment): Promise<void> {
    if (!this.enabled) return;

    const delay = appointment.startsAt.getTime() - this.leadMs() - Date.now();
    if (delay <= 0) {
      // La cita es para dentro de menos de la antelación (p. ej. mañana
      // mismo): no hay recordatorio — nada de envíos inmediatos raros.
      this.logger.debug(
        `Reminder skipped, lead time already past (appointmentId=${appointment.id})`,
      );
      return;
    }

    const data: ReminderJobData = {
      businessId: appointment.businessId,
      appointmentId: appointment.id,
      startsAt: appointment.startsAt.toISOString(),
    };
    try {
      await this.queue.add('reminder', data, {
        jobId: appointment.id,
        delay,
        attempts: JOB_ATTEMPTS,
        backoff: { type: 'exponential', delay: JOB_BACKOFF_MS },
        // Libera el jobId al completar (una reprogramación posterior puede
        // volver a usarlo) y mantiene Redis limpio.
        removeOnComplete: true,
      });
    } catch (error) {
      this.logger.error(
        `Failed to schedule reminder (appointmentId=${appointment.id}); ` +
          `appointment is unaffected (best-effort)`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async cancel(appointmentId: string): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.queue.remove(appointmentId);
    } catch (error) {
      this.logger.error(
        `Failed to remove reminder job (appointmentId=${appointmentId}); ` +
          `the processor's re-read will discard it anyway`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async reschedule(appointment: ReminderAppointment): Promise<void> {
    if (!this.enabled) return;
    await this.cancel(appointment.id);
    await this.schedule(appointment);
  }

  // Flag estricto de la casa: solo el string EXACTO 'true' activa; cualquier
  // otro valor u omisión = apagado silencioso a prueba de typos.
  private get enabled(): boolean {
    return this.config.get<string>('REMINDERS_ENABLED') === 'true';
  }

  // Antelación en ms. REMINDERS_LEAD_MINUTES existe SOLO para verificación
  // manual en vivo (una antelación de 24h no es testeable razonablemente);
  // si está presente y es válida, manda sobre las 24h — con WARN para que
  // nunca quede activa en producción por descuido.
  private leadMs(): number {
    const override = this.config.get<string>('REMINDERS_LEAD_MINUTES');
    if (override !== undefined && override !== '') {
      const minutes = Number(override);
      if (Number.isFinite(minutes) && minutes > 0) {
        this.logger.warn(
          `REMINDERS_LEAD_MINUTES=${minutes} active (manual testing only): ` +
            `overriding the ${REMINDER_LEAD_HOURS}h default`,
        );
        return minutes * 60_000;
      }
      this.logger.warn(
        `Invalid REMINDERS_LEAD_MINUTES ("${override}"); ` +
          `falling back to ${REMINDER_LEAD_HOURS}h`,
      );
    }
    return REMINDER_LEAD_HOURS * 60 * 60_000;
  }
}
