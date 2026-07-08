import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { REMINDERS_QUEUE, RemindersService } from './reminders.service';

/**
 * Infraestructura de la cola de recordatorios (H2 T7): conexión a Redis,
 * registro de la cola y el scheduler. Sin dependencias de otros módulos de
 * feature a propósito — así Appointments (ganchos) y Messaging (processor)
 * pueden importarlo sin ciclos: Reminders → nada; Appointments → Reminders;
 * Messaging → Appointments + Reminders.
 *
 * El processor vive en MessagingModule (necesita WhatsAppAdapter y
 * ConversationService); de ahí que se re-exporte BullModule, para que el
 * registro de la cola sea visible donde se declara el worker.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(config.getOrThrow<string>('REDIS_URL'));
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port) || 6379,
            ...(url.password ? { password: url.password } : {}),
            // Requisito del Worker de BullMQ (lanza al arrancar sin esto).
            maxRetriesPerRequest: null,
            // Fail-fast del producer: con Redis caído, queue.add rechaza al
            // instante en vez de quedarse colgado esperando reconexión —
            // clave para que el best-effort no bloquee la cita. ioredis
            // reconecta en background: la app arranca sin Redis.
            enableOfflineQueue: false,
            // Backoff de reconexión hasta 30s: con la estrategia por defecto
            // (reintento cada ~2s), un Redis caído inunda el log de stack
            // traces (~20 líneas/s medidas). Reintenta indefinidamente igual.
            retryStrategy: (times: number) => Math.min(times * 2_000, 30_000),
          },
        };
      },
    }),
    BullModule.registerQueue({ name: REMINDERS_QUEUE }),
  ],
  providers: [RemindersService],
  exports: [RemindersService, BullModule],
})
export class RemindersModule {}
