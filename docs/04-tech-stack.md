# Onpilot — Tech Stack

## Decisión general

Onpilot se construirá como una aplicación SaaS multi-tenant con frontend web, backend propio, base de datos relacional, sistema de colas e integraciones externas.

El objetivo inicial es crear un MVP sólido y mantenible, priorizando H1 Agenda y clientes antes de WhatsApp, IA, redes o pagos.

## Frontend

### Tecnología principal

- Next.js
- React
- TypeScript

### Estilos

- Tailwind CSS para layout, espaciados, grid, flex, responsive y estructura.
- CSS Modules para estilos visuales de marca, detalles personalizados, animaciones y componentes específicos.

### Librerías previstas

- React Hook Form para formularios.
- Zod para validación.
- TanStack Query para consumo de API.
- Zustand para estado simple de UI.
- Recharts para gráficos.
- date-fns para fechas.

## Backend

### Tecnología principal

- Node.js
- NestJS
- TypeScript

NestJS se usará para mantener una arquitectura modular y ordenada.

Cada dominio importante tendrá su propio módulo:

- Auth
- Businesses
- Users
- Clients
- Services
- Appointments
- Payments
- Dashboard
- WhatsApp
- AI
- Admin
- Billing

## Base de datos

- PostgreSQL
- Prisma ORM

PostgreSQL será la base de datos principal porque Onpilot necesita relaciones claras entre negocios, clientes, citas, cobros, servicios, conversaciones y mensajes.

Prisma se usará para:

- Modelado de datos.
- Migraciones.
- Cliente de base de datos tipado.
- Seed de datos iniciales.

## Multi-tenancy

Onpilot será multi-tenant desde el inicio.

Regla principal:

> Todos los datos operativos deben pertenecer a un negocio mediante `businessId`.

Ninguna query debe devolver datos de otro negocio.

## Autenticación

Sistema previsto:

- JWT access token.
- Refresh token.
- Password hasheado con Argon2 o bcrypt.
- Roles por usuario.

Roles iniciales:

- `onpilot_admin`
- `business_owner`
- `staff`

## Infraestructura local

Para desarrollo local se usará Docker Compose con:

- PostgreSQL
- Redis

## Colas y jobs

- BullMQ
- Redis

Usos previstos:

- Recordatorios de citas.
- Posts programados.
- Reactivación de clientes.
- Jobs nocturnos.
- Alertas automáticas.

## IA

- Claude API

Modelos previstos:

- Claude Haiku para WhatsApp automático.
- Claude Sonnet para generación de captions.
- Claude Haiku para ideas de contenido en batch.

## WhatsApp

- WhatsApp Cloud API directa de Meta.

Se usará para:

- Recibir mensajes.
- Enviar respuestas.
- Recordatorios.
- Confirmaciones.
- Cancelaciones.
- Reactivación.

## Redes sociales

Para MVP:

- Zernio como API unificada.

A futuro:

- Meta Graph API directa.
- TikTok Content Posting API directa.

## Pagos

- Stripe

Usos previstos:

- Suscripciones.
- Plan mensual.
- Plan anual.
- Activación/desactivación de módulos.
- Facturación.

## Email

- Resend

Usos previstos:

- Onboarding.
- Notificaciones.
- Recuperación de contraseña.
- Alertas internas.

## Storage

- Cloudflare R2 o S3 compatible.

Usos previstos:

- Imágenes.
- Vídeos.
- Archivos subidos.
- Importaciones CSV/Excel.

## Deploy MVP

- Frontend: Vercel.
- Backend: Railway.
- PostgreSQL: Railway o Neon.
- Redis: Railway.
- Storage: Cloudflare R2.

## Herramientas de calidad

- ESLint.
- Prettier.
- TypeScript strict.
- Prisma validate.
- Tests progresivos.
- Sentry para errores.
- PostHog para analítica de producto.

## Nota sobre Node.js

El entorno local actual usa Node 24.

Si alguna dependencia de Next.js, NestJS o Prisma genera problemas, se usará Node 22 LTS mediante nvm.