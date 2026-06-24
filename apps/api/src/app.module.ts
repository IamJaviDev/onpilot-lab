import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuthModule } from './auth/auth.module';
import { CashModule } from './cash/cash.module';
import { ClientsModule } from './clients/clients.module';
import { PaymentsModule } from './payments/payments.module';
import { ServicesModule } from './services/services.module';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    AuthModule,
    ClientsModule,
    ServicesModule,
    AppointmentsModule,
    PaymentsModule,
    CashModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
