import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';

/**
 * Smoke test de wiring: construye el grafo DI COMPLETO del AppModule.
 *
 * Por qué existe: el resto de la suite son tests unitarios que instancian los
 * servicios a mano con Prisma mockeado; nunca montan el grafo de Nest, así que
 * un fallo de import de módulo (p.ej. un @UseGuards(JwtAuthGuard) sin importar
 * AuthModule → JwtService irresoluble) pasa desapercibido hasta que el servidor
 * arranca de verdad. Este test caza esa familia entera en un solo golpe.
 *
 * `.compile()` resuelve e instancia todos los providers (es donde salta
 * UnknownDependenciesException) pero NO llama a onModuleInit → no abre Postgres.
 * BullMQ/ioredis sí se construyen; por eso el close() del finally es
 * obligatorio para no dejar handles abiertos.
 *
 * Sin --forceExit a propósito: en el camino feliz (el normal) close() cierra
 * todo y jest sale limpio. Si el grafo llegara a NO compilar, compile() lanza,
 * moduleRef queda undefined y el test FALLA (por excepción o, si además queda
 * algún handle de Redis de una instanciación parcial, por timeout): en ambos
 * casos es un fallo ruidoso, que es justo lo que se busca.
 */

// Env dummy para pasar la validación de arranque. validateEnv solo comprueba
// PRESENCIA de las claves, así que cualquier valor no vacío sirve.
//
// FUENTE DE VERDAD: src/config/env.validation.ts (REQUIRED_ENV_VARS). Este stub
// se mantiene A MANO a propósito: si mañana se añade una var obligatoria y no se
// refleja aquí, validateEnv lanzará "Missing required environment variables: …"
// y este test fallará ruidosamente — recordatorio de mantener el contrato.
//
// Nota: ConfigModule también carga apps/api/.env si existe (arranque local), así
// que en local ese .env puede tapar un hueco del stub. La red real es CI, donde
// no hay .env y ESTE stub es la única fuente: ahí un contrato desincronizado
// falla en seco. Por eso el stub no se deriva de REQUIRED_ENV_VARS (importarlo
// lo mantendría siempre en sync y jamás fallaría: se perdería el aviso).
const ENV_STUB: Record<string, string> = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/test?schema=public',
  JWT_SECRET: 'test-secret',
  JWT_ACCESS_TTL: '900s',
  REFRESH_TOKEN_TTL: '7d',
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'test',
  WHATSAPP_APP_SECRET: 'test',
  WHATSAPP_PHONE_NUMBER_ID: 'test',
  WHATSAPP_BUSINESS_ID: 'test',
  WHATSAPP_ACCESS_TOKEN: 'test',
  ANTHROPIC_API_KEY: 'test',
  REDIS_URL: 'redis://localhost:6379',
};

describe('AppModule (wiring)', () => {
  const saved: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const [key, value] of Object.entries(ENV_STUB)) {
      saved[key] = process.env[key];
      process.env[key] = process.env[key] ?? value;
    }
  });

  afterAll(() => {
    for (const key of Object.keys(ENV_STUB)) {
      process.env[key] = saved[key];
    }
  });

  it('compila el grafo DI completo', async () => {
    let moduleRef: TestingModule | undefined;
    try {
      moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      expect(moduleRef).toBeDefined();
    } finally {
      // Cierre garantizado: onModuleDestroy de BullMQ/ioredis y Prisma.
      await moduleRef?.close();
    }
  }, 30000);
});
