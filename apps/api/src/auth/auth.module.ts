import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [
    // Rate limiting solo-Auth: registrado en este módulo (no global) para
    // limitar el ámbito a las rutas de autenticación. El default (10/min) es
    // fallback; cada endpoint lo sobrescribe con su @Throttle. Almacenamiento
    // en memoria (MVP monoinstancia).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.getOrThrow<string>(
            'JWT_ACCESS_TTL',
          ) as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  // Exporta JwtModule además del guard: los módulos que importan AuthModule
  // necesitan resolver JwtService (dependencia del JwtAuthGuard).
  exports: [JwtAuthGuard, JwtModule],
})
export class AuthModule {}
