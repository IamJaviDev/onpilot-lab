# Onpilot — Database Model

## Objetivo

Este documento define el modelo inicial de base de datos para Onpilot.

La base de datos principal será PostgreSQL y el ORM será Prisma.

El modelo debe estar preparado para un SaaS multi-tenant desde el inicio.

---

## Principios generales

- PostgreSQL será la fuente de verdad.
- Prisma gestionará modelos y migraciones.
- Las entidades operativas tendrán `businessId`.
- No se debe confiar en `businessId` recibido desde frontend.
- Los IDs serán UUID.
- Las fechas se guardarán en UTC.
- Se usará soft delete en entidades importantes.
- Se debe evitar almacenar datos clínicos o médicos.

---

## Entidades principales iniciales

Para Fase 1 se necesitan:

- User.
- Business.
- BusinessMember.
- Client.
- Service.
- Appointment.
- Payment.
- AuditLog.

Para fases posteriores:

- Conversation.
- Message.
- BotConfig.
- IntegrationConnection.
- Post.
- Alert.
- Subscription.
- Plan.

---

## User

Representa una persona que puede iniciar sesión.

Puede ser:

- Usuario interno de Onpilot.
- Propietario de negocio.
- Staff de negocio.

Campos:

```txt
id
email
passwordHash
name
globalRole
isActive
createdAt
updatedAt
deletedAt
```

`globalRole` puede ser:

```txt
ONPILOT_ADMIN
USER
```

La pertenencia a negocios se gestiona con `BusinessMember`.

---

## Business

Representa un negocio cliente de Onpilot.

Campos:

```txt
id
name
sector
city
phone
email
timezone
isActive
createdAt
updatedAt
deletedAt
```

Ejemplos de sector:

```txt
BEAUTY
PHYSIO
PSYCHOLOGY
NUTRITION
DENTAL
FITNESS
OTHER
```

---

## BusinessMember

Relaciona usuarios con negocios.

Campos:

```txt
id
businessId
userId
role
isActive
createdAt
updatedAt
```

Roles:

```txt
BUSINESS_OWNER
STAFF
```

Reglas:

- Un usuario puede pertenecer a uno o varios negocios.
- En MVP probablemente un usuario pertenezca solo a un negocio.
- El rol operativo dentro del negocio se define aquí.

---

## Client

Cliente final del negocio.

Campos:

```txt
id
businessId
name
phone
email
notes
isVip
vipDiscountPercent
createdAt
updatedAt
deletedAt
```

Reglas:

- `businessId` obligatorio.
- `name` obligatorio.
- `phone` obligatorio.
- `email` opcional.
- `isVip` default false.
- `vipDiscountPercent` default 0.
- Teléfono único por negocio entre clientes activos.
- Soft delete.

Índice recomendado:

```txt
businessId + phone
```

---

## Service

Servicio ofrecido por el negocio.

Campos:

```txt
id
businessId
name
description
basePrice
durationMinutes
isActive
createdAt
updatedAt
deletedAt
```

Reglas:

- `businessId` obligatorio.
- `name` obligatorio.
- `basePrice` no negativo.
- `durationMinutes` mayor que 0.
- Soft delete si ya tiene citas asociadas.

---

## Appointment

Cita en la agenda.

Campos:

```txt
id
businessId
clientId
serviceId
startsAt
endsAt
status
source
notes
createdById
createdAt
updatedAt
cancelledAt
cancellationReason
deletedAt
```

Estados:

```txt
SCHEDULED
CONFIRMED
COMPLETED
CANCELLED
NO_SHOW
```

Sources:

```txt
MANUAL
WHATSAPP
IMPORT
SYSTEM
```

Reglas:

- `businessId` obligatorio.
- `clientId` obligatorio.
- `serviceId` obligatorio.
- `startsAt` anterior a `endsAt`.
- No crear citas en pasado.
- En MVP evitar solapamientos de citas activas en el mismo negocio.
- Las citas canceladas no bloquean disponibilidad.
- Soft delete o cancelación antes que borrado físico.

Índices recomendados:

```txt
businessId + startsAt
businessId + clientId
businessId + status
```

---

## Payment

Cobro asociado a una cita, cliente o servicio.

Campos:

```txt
id
businessId
clientId
appointmentId
serviceId
basePrice
vipDiscountAmount
manualDiscountAmount
finalPrice
paymentMethod
status
paidAt
createdById
createdAt
updatedAt
markedAsErrorAt
errorReason
```

Métodos de pago:

```txt
CASH
CARD
BIZUM
TRANSFER
OTHER
```

Estados:

```txt
PAID
ERROR
REFUNDED
```

Reglas:

- `businessId` obligatorio.
- `clientId` obligatorio.
- `appointmentId` opcional pero recomendado si viene de cita.
- `basePrice` no negativo.
- `finalPrice` no negativo.
- No borrar cobros confirmados.
- Marcar como error con nota si procede.

Índices recomendados:

```txt
businessId + paidAt
businessId + clientId
businessId + appointmentId
```

---

## AuditLog

Registro de acciones relevantes.

Campos:

```txt
id
businessId
userId
action
resourceType
resourceId
ip
userAgent
metadata
createdAt
```

Reglas:

- `businessId` puede ser nullable para acciones globales de Onpilot.
- `metadata` puede ser JSON.
- No debe guardar tokens ni secretos.
- Sirve para trazabilidad y seguridad.

---

## BotConfig

Fase 2.

Configuración del bot por negocio.

Campos previstos:

```txt
id
businessId
assistantName
tone
language
outOfHoursMessage
escalationRules
canDiscussPrices
medicalDisclaimerEnabled
createdAt
updatedAt
```

---

## Conversation

Fase 2 (H2 — WhatsApp Automático). Conversación de WhatsApp con un interlocutor.
**Refleja el schema real construido** (ver `apps/api/prisma/schema.prisma`).

Campos:
  id             String    @id @default(uuid(7)) @db.Uuid
  businessId     String    @db.Uuid
  clientId       String?   @db.Uuid   — nullable: puede escribir un desconocido que aún no es cliente
  phone          String                — teléfono del interlocutor en E.164 normalizado
  status         ConversationStatus @default(BOT_ACTIVE)
  lastMessageAt  DateTime?
  contextSummary String?               — resumen de conversación larga (lo generará el BotEngine en tareas futuras; hoy sin implementar)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  deletedAt      DateTime?             — soft delete

Estados (`ConversationStatus`):
  BOT_ACTIVE      — el bot atiende
  PENDING_REVIEW  — escalado; el bot calla, espera atención humana
  HUMAN_CONTROL   — un humano tomó el control desde el panel
  CLOSED          — cerrada (historial); se acumulan varias CLOSED por teléfono

Relaciones: business (Restrict), client? (Restrict), messages Message[].
Índice: `@@index([businessId, status, lastMessageAt])` (lista del panel).
Invariante SQL (en la migración, no en schema.prisma): único parcial `(businessId, phone)`
WHERE `status <> 'CLOSED' AND deletedAt IS NULL` — una sola conversación abierta por teléfono/negocio.

> **Nota de canalidad.** No hay campo `channel` en el schema. La multicanalidad vive hoy como
> concepto de código en el `WhatsAppAdapter` (capa de envío intercambiable, interfaz `to, body → wamid`),
> no como columna. Si una v2 multicanal necesitara discriminar por canal en BD, se reintroduciría entonces.

## Message

Fase 2 (H2). Mensaje individual dentro de una conversación. **Refleja el schema real construido.**

Campos:
  id             String    @id @default(uuid(7)) @db.Uuid
  businessId     String    @db.Uuid   — denormalizado a propósito: filtro multi-tenant directo sin join + habilita el índice de idempotencia por negocio
  conversationId String    @db.Uuid
  direction      MessageDirection
  author         MessageAuthor
  body           String
  waMessageId    String?               — id del mensaje en WhatsApp; clave de idempotencia (Meta reintenta webhooks)
  metadata       Json?                 — tokens/coste aprox del bot, motivo de escalado, marca de recordatorio, etc.
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  deletedAt      DateTime?             — soft delete

Dirección (`MessageDirection`): IN / OUT
Autor (`MessageAuthor`): CLIENT / BOT / HUMAN

Relaciones: business (Restrict), conversation (Restrict). Todas las FKs `onDelete: Restrict`
(los mensajes son material de auditoría; un DELETE físico accidental debe fallar ruidosamente).
Índice: `@@index([conversationId, createdAt])` (hilo).
Invariante SQL: único parcial `(businessId, waMessageId)` WHERE `waMessageId IS NOT NULL AND deletedAt IS NULL` (idempotencia de webhook).
CHECK de coherencia dirección/autor: `IN`→`CLIENT`, `OUT`→`BOT|HUMAN`.

## IntegrationConnection

Fase 2/4.

Conexiones externas por negocio.

Campos previstos:

```txt
id
businessId
provider
status
externalAccountId
accessTokenEncrypted
refreshTokenEncrypted
expiresAt
createdAt
updatedAt
```

Providers:

```txt
WHATSAPP_META
META_GRAPH
TIKTOK
ZERNIO
STRIPE
```

---

## Alert

Fase 3.

Alertas automáticas.

Campos previstos:

```txt
id
businessId
type
status
title
description
metadata
createdAt
resolvedAt
```

Tipos:

```txt
CLIENTS_TO_REACTIVATE
WHATSAPP_PENDING
NO_SOCIAL_POSTS
HIGH_BOT_ESCALATION
VIP_CANDIDATE
CANCELLATIONS_INCREASED
```

---

## Post

Fase 4.

Publicación de redes.

Campos previstos:

```txt
id
businessId
caption
mediaUrl
networks
status
scheduledAt
publishedAt
metrics
createdAt
updatedAt
```

Estados:

```txt
DRAFT
SCHEDULED
PUBLISHED
FAILED
```

---

## ToolSubscription

Control de herramientas activas por negocio.

Campos previstos:

```txt
id
businessId
tool
isActive
createdAt
updatedAt
```

Tools:

```txt
H1_AGENDA_CLIENTES
H2_WHATSAPP_AUTOMATICO
H4_CONTENIDO_REDES
H5_PANEL_CONTROL
```

---

## Relaciones principales Fase 1

```txt
Business 1 — N BusinessMember
User 1 — N BusinessMember

Business 1 — N Client
Business 1 — N Service
Business 1 — N Appointment
Business 1 — N Payment

Client 1 — N Appointment
Client 1 — N Payment

Service 1 — N Appointment
Service 1 — N Payment

Appointment 0/1 — 1 Payment

User 1 — N Appointment createdBy
User 1 — N Payment createdBy
```

---

## Enums iniciales

```txt
GlobalRole:
- ONPILOT_ADMIN
- USER

BusinessMemberRole:
- BUSINESS_OWNER
- STAFF

BusinessSector:
- BEAUTY
- PHYSIO
- PSYCHOLOGY
- NUTRITION
- DENTAL
- FITNESS
- OTHER

AppointmentStatus:
- SCHEDULED
- CONFIRMED
- COMPLETED
- CANCELLED
- NO_SHOW

AppointmentSource:
- MANUAL
- WHATSAPP
- IMPORT
- SYSTEM

PaymentMethod:
- CASH
- CARD
- BIZUM
- TRANSFER
- OTHER

PaymentStatus:
- PAID
- ERROR
- REFUNDED

Tool:
- H1_AGENDA_CLIENTES
- H2_WHATSAPP_AUTOMATICO
- H4_CONTENIDO_REDES
- H5_PANEL_CONTROL
```

---

## Reglas de multi-tenancy en base de datos

Todas las entidades operativas deben incluir `businessId`.

En Fase 1:

- Client.
- Service.
- Appointment.
- Payment.
- AuditLog.

En fases posteriores:

- Conversation.
- Message.
- BotConfig.
- IntegrationConnection.
- Alert.
- Post.
- ToolSubscription.

---

## Decisiones pendientes

Estas decisiones se revisarán antes de implementar Prisma:

1. Si Appointment debe tener profesional/staff asignado desde MVP.
2. Si se permite agenda multi-profesional desde MVP.
3. Si se guarda ClientNote separado o solo campo `notes` en Client.
4. Si Payment debe permitir varios cobros por cita.
5. Si se necesita Invoice en Fase 1 o se deja para Stripe/Fase 5.

Decisión recomendada para MVP:

- Agenda simple de un negocio sin multi-profesional.
- Un cobro principal por cita.
- Notas simples en Client.
- Sin Invoice todavía.
