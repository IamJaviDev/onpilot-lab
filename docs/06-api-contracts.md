# Onpilot — API Contracts

## Objetivo

Este documento define los contratos iniciales de API para Onpilot.

El backend será NestJS y expondrá una API REST para el frontend Next.js.

En Fase 1 la API se centrará en H1 Agenda y Clientes.

---

## Principios generales

- API REST.
- JSON.
- Autenticación mediante JWT.
- Todas las rutas privadas requieren usuario autenticado.
- Las rutas operativas deben filtrar por `businessId`.
- El frontend no debe enviar `businessId` como fuente de verdad.
- El backend obtiene `businessId` desde el usuario autenticado y el negocio activo.
- Validación con DTOs en NestJS.
- Errores claros y consistentes.

---

## Prefijo base

```txt
/api
```

Ejemplo:

```txt
/api/auth/login
/api/clients
/api/appointments
```

---

## Formato de error recomendado

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "details": []
}
```

---

## Auth

### POST /auth/register-business

Crea un usuario propietario y un negocio.

Uso inicial para onboarding MVP.

Request:

```json
{
  "businessName": "Clínica Demo",
  "sector": "PHYSIO",
  "city": "Valencia",
  "ownerName": "Javier",
  "email": "javier@example.com",
  "password": "password123"
}
```

Response:

```json
{
  "user": {
    "id": "uuid",
    "name": "Javier",
    "email": "javier@example.com"
  },
  "business": {
    "id": "uuid",
    "name": "Clínica Demo"
  },
  "accessToken": "jwt",
  "refreshToken": "jwt"
}
```

Reglas:

- Email único.
- Password hasheado.
- Crear Business.
- Crear BusinessMember con rol `BUSINESS_OWNER`.
- Activar por defecto H1 para MVP.

---

### POST /auth/login

Request:

```json
{
  "email": "javier@example.com",
  "password": "password123"
}
```

Response:

```json
{
  "user": {
    "id": "uuid",
    "name": "Javier",
    "email": "javier@example.com"
  },
  "businesses": [
    {
      "id": "uuid",
      "name": "Clínica Demo",
      "role": "BUSINESS_OWNER"
    }
  ],
  "accessToken": "jwt",
  "refreshToken": "jwt"
}
```

---

### POST /auth/refresh

Request:

```json
{
  "refreshToken": "jwt"
}
```

Response:

```json
{
  "accessToken": "jwt",
  "refreshToken": "jwt"
}
```

---

### POST /auth/logout

Revoca refresh token.

---

### GET /auth/me

Devuelve usuario actual y negocio activo.

Response:

```json
{
  "user": {
    "id": "uuid",
    "name": "Javier",
    "email": "javier@example.com"
  },
  "activeBusiness": {
    "id": "uuid",
    "name": "Clínica Demo",
    "role": "BUSINESS_OWNER"
  }
}
```

---

## Clients

### GET /clients

Lista clientes del negocio activo.

Query params:

```txt
search
tag
page
limit
```

Response:

```json
{
  "items": [
    {
      "id": "uuid",
      "name": "Ana Pérez",
      "phone": "600000000",
      "email": "ana@example.com",
      "isVip": false,
      "vipDiscountPercent": 0,
      "tags": ["NEW"],
      "createdAt": "2026-01-01T10:00:00.000Z"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 1
}
```

Reglas:

- Filtrar siempre por `businessId`.
- No devolver clientes eliminados.
- Búsqueda por nombre, teléfono o email.

---

### POST /clients

Crea cliente.

Request:

```json
{
  "name": "Ana Pérez",
  "phone": "600000000",
  "email": "ana@example.com",
  "notes": "Prefiere tardes"
}
```

Response:

```json
{
  "id": "uuid",
  "name": "Ana Pérez",
  "phone": "600000000",
  "email": "ana@example.com",
  "isVip": false,
  "vipDiscountPercent": 0
}
```

Reglas:

- `name` obligatorio.
- `phone` obligatorio.
- Teléfono único por negocio.
- `businessId` se asigna desde backend.

---

### GET /clients/:id

Devuelve ficha completa del cliente.

Response:

```json
{
  "id": "uuid",
  "name": "Ana Pérez",
  "phone": "600000000",
  "email": "ana@example.com",
  "notes": "Prefiere tardes",
  "isVip": true,
  "vipDiscountPercent": 10,
  "stats": {
    "totalVisits": 3,
    "totalSpent": 180,
    "lastVisitAt": "2026-01-10T10:00:00.000Z",
    "nextAppointmentAt": "2026-01-20T10:00:00.000Z"
  },
  "appointments": [],
  "payments": []
}
```

Reglas:

- Buscar por `id` y `businessId`.
- No exponer datos de otro negocio.

---

### PATCH /clients/:id

Actualiza cliente.

Request:

```json
{
  "name": "Ana Pérez",
  "email": "ana.new@example.com",
  "notes": "Nueva nota"
}
```

Reglas:

- Actualizar filtrando por `id` y `businessId`.

---

### PATCH /clients/:id/vip

Actualiza estado VIP.

Request:

```json
{
  "isVip": true,
  "vipDiscountPercent": 10
}
```

Reglas:

- Descuento entre 0 y 100.
- Registrar AuditLog.

---

### DELETE /clients/:id

Soft delete.

Reglas:

- No borrar físicamente.
- Filtrar por `id` y `businessId`.

---

## Services

### GET /services

Lista servicios activos.

Query params:

```txt
includeInactive
```

---

### POST /services

Request:

```json
{
  "name": "Sesión fisioterapia",
  "description": "Sesión de 50 minutos",
  "basePrice": 45,
  "durationMinutes": 50
}
```

Reglas:

- `basePrice` >= 0.
- `durationMinutes` > 0.
- `businessId` desde backend.

---

### GET /services/:id

Devuelve un servicio filtrado por `businessId`.

---

### PATCH /services/:id

Actualiza servicio.

---

### DELETE /services/:id

Soft delete o marca `isActive = false`.

---

## Appointments

### GET /appointments

Lista citas.

Query params:

```txt
from
to
status
clientId
```

Ejemplo:

```txt
GET /appointments?from=2026-01-01&to=2026-01-07
```

Response:

El endpoint devuelve un **array pelado** de citas (no envuelto en `{ items }`),
ordenado por `startsAt` ascendente.

```json
[
  {
    "id": "uuid",
    "client": {
      "id": "uuid",
      "name": "Ana Pérez",
      "phone": "600000000"
    },
    "service": {
      "id": "uuid",
      "name": "Sesión fisioterapia",
      "basePrice": 45
    },
    "startsAt": "2026-01-01T10:00:00.000Z",
    "endsAt": "2026-01-01T10:50:00.000Z",
    "status": "CONFIRMED",
    "source": "MANUAL"
  }
]
```

Reglas:

- Filtrar por `businessId`.
- Ordenar por `startsAt`.

---

### POST /appointments

Crea cita.

Request:

```json
{
  "clientId": "uuid",
  "serviceId": "uuid",
  "startsAt": "2026-01-01T10:00:00.000Z",
  "notes": "Primera visita"
}
```

Response:

```json
{
  "id": "uuid",
  "clientId": "uuid",
  "serviceId": "uuid",
  "startsAt": "2026-01-01T10:00:00.000Z",
  "endsAt": "2026-01-01T10:50:00.000Z",
  "status": "CONFIRMED",
  "source": "MANUAL"
}
```

Reglas:

- Validar cliente pertenece al negocio.
- Validar servicio pertenece al negocio.
- No crear en pasado.
- Calcular `endsAt` según duración del servicio.
- Evitar solapamiento en MVP.
- `businessId` desde backend.
- `createdById` desde usuario autenticado.

---

### GET /appointments/:id

Devuelve cita filtrada por `businessId`.

---

### PATCH /appointments/:id

Actualiza cita.

Request:

```json
{
  "startsAt": "2026-01-01T11:00:00.000Z",
  "serviceId": "uuid",
  "notes": "Cambio de hora"
}
```

Reglas:

- Filtrar por `id` y `businessId`.
- Recalcular `endsAt` si cambia servicio o inicio.
- Evitar solapamiento.
- No actualizar citas completadas salvo campos permitidos.

---

### PATCH /appointments/:id/cancel

Cancela cita.

Request:

```json
{
  "reason": "Cliente no puede asistir"
}
```

Reglas:

- Cambiar status a `CANCELLED`.
- Guardar `cancelledAt`.
- Guardar motivo.
- No borrar cita.

---

### PATCH /appointments/:id/no-show

Marca como no presentado.

---

## Payments

### POST /payments

Crea cobro manual o asociado a cita.

Request:

```json
{
  "clientId": "uuid",
  "appointmentId": "uuid",
  "serviceId": "uuid",
  "manualDiscountAmount": 5,
  "paymentMethod": "CARD"
}
```

Response:

```json
{
  "id": "uuid",
  "basePrice": 45,
  "vipDiscountAmount": 4.5,
  "manualDiscountAmount": 5,
  "finalPrice": 35.5,
  "paymentMethod": "CARD",
  "status": "PAID",
  "paidAt": "2026-01-01T10:55:00.000Z"
}
```

Reglas:

- Cliente debe pertenecer al negocio.
- Servicio debe pertenecer al negocio.
- Cita, si existe, debe pertenecer al negocio.
- Backend calcula `basePrice`.
- Backend calcula descuento VIP.
- Backend calcula precio final.
- No aceptar `finalPrice` desde frontend como fuente de verdad.
- Si hay appointmentId, marcar cita como `COMPLETED`.

---

### GET /payments

Lista cobros.

Query params:

```txt
from
to
clientId
paymentMethod
status
```

---

### GET /payments/:id

Devuelve cobro filtrado por `businessId`.

---

### PATCH /payments/:id/mark-error

Marca cobro como error.

Request:

```json
{
  "reason": "Cobro duplicado por error"
}
```

Reglas:

- No borrar cobro.
- Cambiar status a `ERROR`.
- Guardar motivo.
- Registrar AuditLog.

---

## Cash Closing / Caja

### GET /cash/summary

Resumen de caja.

Query params:

```txt
from
to
```

Response:

```json
{
  "totalRevenue": 1200,
  "paymentsCount": 30,
  "averageTicket": 40,
  "byPaymentMethod": [
    {
      "paymentMethod": "CARD",
      "total": 700,
      "count": 18
    }
  ],
  "topServices": [
    {
      "serviceId": "uuid",
      "name": "Sesión fisioterapia",
      "totalRevenue": 500,
      "count": 12
    }
  ],
  "errorsCount": 1
}
```

Reglas:

- Solo cobros del negocio activo.
- Excluir o separar cobros en estado `ERROR`.
- Fechas en UTC.

---

## Dashboard

### GET /dashboard/h1

KPIs básicos de H1.

Query params:

```txt
period
from
to
```

Response:

```json
{
  "todayAppointments": 5,
  "upcomingAppointments": 12,
  "todayRevenue": 180,
  "monthRevenue": 2300,
  "newClientsThisMonth": 8,
  "averageTicket": 42,
  "topServices": [],
  "clientsToReactivate": 4
}
```

---

## Availability

### GET /availability

Consulta disponibilidad básica.

Query params:

```txt
date
serviceId
```

Response:

```json
{
  "date": "2026-01-01",
  "serviceId": "uuid",
  "slots": [
    {
      "startsAt": "2026-01-01T10:00:00.000Z",
      "endsAt": "2026-01-01T10:50:00.000Z",
      "available": true
    }
  ]
}
```

Reglas MVP:

- Agenda simple.
- Horario fijo o configurable más adelante.
- Excluir citas activas existentes.
- Este endpoint será reutilizado por H2 WhatsApp.

---

## Orden recomendado de implementación API

1. Auth.
2. Businesses.
3. Clients.
4. Services.
5. Appointments.
6. Payments.
7. Cash summary.
8. Dashboard H1.
9. Availability básica.

---

## Criterios de aceptación API Fase 1

La API está lista cuando:

- Hay registro/login.
- JWT funciona.
- Se puede crear negocio.
- Se puede crear cliente.
- Se puede crear servicio.
- Se puede crear cita.
- Se puede cancelar cita.
- Se puede cobrar cita.
- Se puede ver caja.
- Se puede ver dashboard básico.
- Todas las operaciones filtran por `businessId`.
- El backend no acepta `businessId` desde frontend como fuente de verdad.
- Las validaciones principales funcionan.
