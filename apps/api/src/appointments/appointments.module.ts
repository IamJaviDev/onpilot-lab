import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

@Module({
  imports: [AuthModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  // Exportado (H2 T5): el bot crea citas reutilizando este service (misma
  // validación y protección de solape que la agenda web).
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
