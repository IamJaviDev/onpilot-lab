# Onpilot — Multi-tenancy Rules

## Objetivo

Onpilot es un SaaS multi-tenant.

Esto significa que varios negocios usan la misma plataforma, pero cada negocio debe ver únicamente sus propios datos.

La regla principal del sistema es:

> Ningún negocio puede ver, modificar, borrar o acceder a datos de otro negocio.

Esta regla es obligatoria desde la Fase 1.

---

## Definición de tenant

En Onpilot, un tenant es un negocio cliente.

La entidad principal será:

```txt
Business
```

Cada negocio representa una cuenta independiente dentro de Onpilot.

Ejemplos:

- Clínica dental Pérez.
- Centro de estética Luna.
- FisioBenidorm.
- Psicología Clara García.

---

## Regla principal de datos

Toda entidad operativa debe estar asociada a un negocio mediante:

```txt
businessId
```

Entidades que deben tener `businessId`:

- User, cuando sea usuario de negocio.
- Client.
- Service.
- Appointment.
- Payment.
- Conversation.
- Message.
- BotConfig.
- Post.
- Alert.
- UploadedFile.
- AuditLog.
- IntegrationConnection.

---

## Entidades globales

Algunas entidades pueden ser globales y no pertenecer a un negocio concreto.

Ejemplos:

- Plan.
- Feature.
- OnpilotAdmin.
- SystemSetting.
- PublicPricingConfig.

Estas entidades deben tratarse con cuidado y solo ser accesibles por usuarios internos de Onpilot.

---

## Regla de queries

Toda query sobre datos operativos debe filtrar por `businessId`.

Ejemplo correcto:

```ts
await prisma.client.findMany({
  where: {
    businessId: currentUser.businessId,
  },
});
```

Ejemplo incorrecto:

```ts
await prisma.client.findMany();
```

Este ejemplo es peligroso porque podría devolver clientes de todos los negocios.

---

## Regla de acceso por ID

Nunca se debe buscar una entidad únicamente por `id` si es un dato del negocio.

Ejemplo incorrecto:

```ts
await prisma.client.findUnique({
  where: {
    id: clientId,
  },
});
```

Ejemplo correcto:

```ts
await prisma.client.findFirst({
  where: {
    id: clientId,
    businessId: currentUser.businessId,
  },
});
```

---

## Regla para crear datos

Cuando se crea un dato operativo, el `businessId` no debe venir libremente desde el frontend.

El backend debe asignarlo desde el usuario autenticado.

Ejemplo correcto:

```ts
await prisma.client.create({
  data: {
    businessId: currentUser.businessId,
    name: dto.name,
    phone: dto.phone,
  },
});
```

Ejemplo incorrecto:

```ts
await prisma.client.create({
  data: {
    businessId: dto.businessId,
    name: dto.name,
    phone: dto.phone,
  },
});
```

El frontend no puede decidir a qué negocio pertenece un dato.

---

## Regla para actualizar datos

Toda actualización debe verificar `businessId`.

Ejemplo correcto:

```ts
await prisma.client.updateMany({
  where: {
    id: clientId,
    businessId: currentUser.businessId,
  },
  data: {
    name: dto.name,
  },
});
```

No se debe actualizar usando solo el `id`.

---

## Regla para borrar datos

Toda eliminación debe verificar `businessId`.

Preferiblemente se usará soft delete en entidades importantes.

Campos recomendados:

```txt
deletedAt
deletedBy
```

Ejemplo correcto:

```ts
await prisma.client.updateMany({
  where: {
    id: clientId,
    businessId: currentUser.businessId,
  },
  data: {
    deletedAt: new Date(),
  },
});
```

---

## Backoffice interno

Los usuarios internos de Onpilot podrán acceder a datos de diferentes negocios solo desde módulos internos protegidos.

Rol requerido:

```txt
onpilot_admin
```

Incluso para el backoffice, las acciones deben quedar registradas en `AuditLog`.

---

## Roles iniciales

Roles mínimos:

```txt
onpilot_admin
business_owner
staff
```

### onpilot_admin

Usuario interno del equipo Onpilot.

Puede:

- Ver negocios.
- Activar/desactivar herramientas.
- Revisar onboarding.
- Revisar conectores.
- Revisar calidad del bot.
- Gestionar soporte.
- Ver métricas SaaS.

### business_owner

Propietario del negocio cliente.

Puede:

- Gestionar usuarios del negocio.
- Configurar negocio.
- Gestionar clientes.
- Gestionar citas.
- Gestionar servicios.
- Ver cobros.
- Ver dashboard.
- Configurar bot.
- Conectar integraciones.

### staff

Empleado del negocio.

Puede:

- Ver agenda.
- Crear citas.
- Editar citas.
- Ver clientes.
- Añadir notas.
- Registrar cobros si tiene permiso.

No puede:

- Cambiar facturación.
- Cambiar plan.
- Eliminar negocio.
- Gestionar integraciones críticas salvo permiso explícito.

---

## Feature access

Cada negocio puede tener activadas diferentes herramientas.

Herramientas:

```txt
H1_AGENDA_CLIENTES
H2_WHATSAPP_AUTOMATICO
H4_CONTENIDO_REDES
H5_PANEL_CONTROL
```

Antes de acceder a una funcionalidad, el backend debe comprobar si el negocio tiene activa esa herramienta.

Ejemplo:

- Si H2 no está activo, el negocio no puede usar el módulo WhatsApp.
- Si H4 no está activo, el negocio no puede programar publicaciones.
- Si H5 no está activo, el negocio no puede ver el panel avanzado.

---

## Middleware / Guards

El backend debe tener guards o middleware para:

- Verificar usuario autenticado.
- Resolver `currentUser`.
- Resolver `currentBusiness`.
- Verificar rol.
- Verificar herramienta activa.
- Verificar acceso al recurso por `businessId`.

---

## Regla para webhooks

Los webhooks externos también deben respetar multi-tenancy.

Ejemplo WhatsApp:

1. Meta envía mensaje entrante.
2. Backend identifica el número receptor.
3. Backend busca qué negocio tiene conectado ese número.
4. Backend procesa el mensaje dentro de ese `businessId`.

Nunca se debe procesar un webhook sin resolver antes a qué negocio pertenece.

---

## Regla para jobs

Los jobs programados deben ejecutarse siempre con contexto de negocio.

Ejemplos:

- Recordatorios de citas.
- Reactivación de clientes.
- Posts programados.
- Alertas automáticas.

Cada job debe incluir `businessId`.

Ejemplo:

```ts
await queue.add('appointment-reminder', {
  businessId,
  appointmentId,
});
```

---

## Regla para logs

Los logs de negocio deben incluir siempre:

- businessId.
- userId si aplica.
- action.
- resourceType.
- resourceId.
- timestamp.

---

## Checklist obligatorio para nuevas features

Antes de implementar cualquier feature, responder:

- ¿Qué entidades usa?
- ¿Todas tienen `businessId` si son datos operativos?
- ¿Todas las queries filtran por `businessId`?
- ¿Se evita aceptar `businessId` desde frontend?
- ¿Hay roles implicados?
- ¿Requiere comprobar herramienta activa?
- ¿Hay datos sensibles?
- ¿Debe registrarse en AuditLog?
- ¿Hay webhooks o jobs asociados?

---

## Regla final

Si una implementación no puede garantizar aislamiento entre negocios, no debe implementarse hasta rediseñarla.
