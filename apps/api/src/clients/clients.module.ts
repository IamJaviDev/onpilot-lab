import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

@Module({
  imports: [AuthModule],
  controllers: [ClientsController],
  providers: [ClientsService],
  // Exportado (H2 T5): el bot crea el cliente mínimo (nombre + teléfono)
  // reutilizando este service (mismo manejo de teléfono único).
  exports: [ClientsService],
})
export class ClientsModule {}
