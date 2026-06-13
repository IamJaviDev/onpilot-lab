# CLAUDE.md — Onpilot

> Este archivo se carga automáticamente en cada sesión de Claude Code.
> Contiene las reglas permanentes del proyecto. Las specs profundas viven en `docs/`
> y se leen bajo demanda al empezar cada tarea (ver `/spec`). No copiar specs aquí:
> este archivo debe mantenerse breve y siempre vigente.

---

## Proyecto

Onpilot es un SaaS **multi-tenant** para negocios locales de servicios (estética, peluquería, fisioterapia, psicología, nutrición, dental, fitness y afines). Un tenant = un negocio (`Business`).

Propuesta de valor: *el negocio funciona en piloto automático mientras el profesional se dedica a lo que sabe hacer.*

Módulos: **H1** Agenda y clientes (primero, fuente de verdad) · **H2** WhatsApp automático · **H4** Contenido para redes · **H5** Panel de control. Solo se construye lo que corresponde a la tarea actual.

---

## Perfil del desarrollador y filosofía de código

Un desarrollador fullstack trabajando casi en solitario con IA como copiloto. Por tanto el código debe ser:

- Claro, modular, fácil de revisar.
- Sin sobreingeniería ni abstracciones prematuras.
- Adecuado a un MVP real, preparado para crecer de forma progresiva.

No implementar varias features grandes a la vez. No inventar requisitos que no aparezcan en `docs/`.

---

## Flujo de trabajo OBLIGATORIO

Toda tarea sigue, en orden:

```
SPEC → PLAN → APROBACIÓN → IMPLEMENTACIÓN → CHECK → REVISIÓN → COMMIT
```

Reglas duras del flujo:

- **Nunca escribir código antes de entregar el PLAN y recibir aprobación explícita.** La aprobación es una frase del tipo "Plan aprobado. Implementa únicamente lo descrito".
- En IMPLEMENTACIÓN: tocar solo los archivos aprobados, no ampliar el alcance, no refactorizar de paso, no añadir mejoras no solicitadas. Cualquier desviación necesaria se explica antes.
- **No ejecutar `git commit` por cuenta propia.** Solo proponer el commit sugerido. Comitear únicamente si se pide de forma expresa.
- No afirmar que los checks han pasado si no se han ejecutado de verdad.

Comandos del flujo (slash commands de este repo): `/spec`, `/plan`, `/implement`, `/check`, `/review`.

---

## Reglas de multi-tenancy (NO NEGOCIABLES)

> Ningún negocio puede ver, modificar, eliminar ni acceder a datos de otro negocio.

- Toda entidad operativa lleva `businessId` (Client, Service, Appointment, Payment, AuditLog, y las futuras).
- **El `businessId` lo asigna el backend desde el usuario autenticado / negocio activo. JAMÁS desde el frontend.** Prohibido usar como fuente de verdad: `dto.businessId`, `body.businessId`, `query.businessId`.
- Toda lectura filtra por `businessId`.
- Buscar por ID siempre con `id + businessId` (usar `findFirst`, no `findUnique` para datos de negocio).
- Toda actualización filtra por `id + businessId` (`updateMany`).
- Toda eliminación filtra por `id + businessId`; preferir soft delete (`deletedAt`).
- Jobs: incluir siempre `businessId` en el payload.
- Webhooks: resolver primero a qué negocio pertenece, antes de procesar.

Checklist antes de cualquier feature: ¿qué entidades usa? · ¿todas tienen `businessId` si son operativas? · ¿todas las queries filtran por `businessId`? · ¿se evita aceptar `businessId` del frontend? · ¿roles implicados? · ¿requiere comprobar herramienta activa? · ¿datos sensibles? · ¿debe registrarse en `AuditLog`? · ¿hay webhooks o jobs?

Si una implementación no puede garantizar el aislamiento entre negocios, no se implementa hasta rediseñarla.

---

## Reglas de seguridad

- **No almacenar datos clínicos/médicos:** diagnósticos, historiales, informes, evaluaciones psicológicas, medicación, documentos clínicos. Onpilot solo guarda nombre, teléfono, email, citas, servicios y notas de gestión.
- Contraseñas hasheadas (Argon2 o bcrypt).
- Auth: JWT de corta duración + refresh token revocable.
- No exponer ni loguear: tokens, secrets, `DATABASE_URL`, stack traces, datos internos, datos de otros negocios.
- `AuditLog` y logs no guardan tokens ni secretos.
- Todo input se valida. Toda acción sensible debe poder auditarse.

---

## Prohibiciones (mientras no se pida explícitamente)

No añadir: WhatsApp, Stripe/pagos, redes sociales, multi-profesional / `staffId`, facturas, abstracciones prematuras, dependencias sin justificar. No modificar archivos no relacionados con la tarea. No borrar código sin explicar por qué. No cambiar arquitectura sin documentarlo. No cambiar la versión de Node sin una razón concreta.

---

## Fuente de verdad

La carpeta `docs/` manda sobre cualquier otra fuente. Para tareas de H1, los docs relevantes son:

```
docs/00-project-brief.md
docs/02-roadmap.md
docs/04-tech-stack.md
docs/05-database-model.md
docs/06-api-contracts.md
docs/07-multi-tenancy-rules.md
docs/08-security-rules.md
docs/10-development-workflow.md
docs/features/h1-agenda-clientes.md
```

> Nota: el PDF `ONPILOT_DOCUMENTO_TECNICO.pdf` (v1.0) está parcialmente desfasado en cuanto a stack (menciona Express/FastAPI/Railway). Para stack manda `docs/`, no el PDF.

Leer los docs relevantes antes de planificar. No fingir haber leído lo que no se ha leído.

---

## Stack oficial (no cambiar versiones sin motivo)

Monorepo **pnpm**: `apps/web` (Next.js 16, React, TS, App Router, Tailwind, alias `@/*`, React Compiler off) en `:3000` · `apps/api` (NestJS 11, TS) en `:4000`.

Datos: **PostgreSQL 18** + **Prisma 7.8** (cliente generado en `apps/api/src/generated/prisma`, ignorado por Git). **Redis 8** levantado en Docker pero aún no conectado al backend.

Entorno aprox.: Node 24.16, pnpm 11.5, Nest CLI 11, Next 16.2, Prisma 7.8. Docker Compose con `onpilot_postgres` y `onpilot_redis`.

Convenciones de datos: **UUID** como IDs · fechas en **UTC** · **soft delete** (`deletedAt`) donde corresponda.

---

## Estado actual

- Backend NestJS arranca y responde Hello World. Prisma instalado e inicializado en `apps/api`, pero **el schema aún no tiene modelos reales y no existe ninguna migración**.
- Funcionan ya: `pnpm prisma:validate`, `pnpm prisma:generate`, lint/typecheck/build de web y api, Postgres y Redis en Docker.
- No ejecutar `prisma migrate` hasta que el schema haya sido revisado y aprobado.

---

## Decisiones cerradas para el MVP de H1

- Agenda **simple por negocio**, sin multi-profesional y sin `staffId` en `Appointment`. Disponibilidad a nivel de negocio.
- **Un cobro principal por cita** (`Payment.appointmentId` nullable y único).
- Notas simples en `Client` (campo `notes`); **no** entidad `ClientNote` separada en MVP.
- Sin facturas, sin Stripe, sin WhatsApp, sin redes todavía.
- 8 entidades del schema H1: `User`, `Business`, `BusinessMember`, `Client`, `Service`, `Appointment`, `Payment`, `AuditLog`.
- Teléfono **único por negocio entre clientes activos** (requiere índice único parcial `WHERE deletedAt IS NULL`, vía migración SQL; un `@@unique` normal no basta).
- Validaciones de rango (`vipDiscountPercent` 0–100, precios ≥ 0) en capa de aplicación; opcionalmente CHECK en BD por migración.
- "No citas en pasado" se valida contra el **timezone del negocio** (`Business.timezone`), no contra UTC del servidor.

---

## Comandos de verificación (CHECK)

Scripts reales existentes en el `package.json` raíz:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm prisma:validate
pnpm prisma:generate
```

Migraciones (no hay script aún; usar directo hasta crearlo):

```bash
pnpm --filter api exec prisma migrate dev --name <nombre>
```

> Pendiente menor: añadir scripts `prisma:format` y `prisma:migrate` al `package.json` raíz cuando toque (cambio a justificar en su propio plan).