# Onpilot — Feature Spec: H1 Agenda y Clientes

## Objetivo

H1 es el primer módulo real que se construirá en Onpilot.

Su objetivo es permitir que un negocio local pueda gestionar:

- Clientes.
- Servicios.
- Citas.
- Cobros.
- Fichas de cliente.
- Historial.
- Cierre de caja básico.
- KPIs iniciales.

H1 es la fuente de verdad del sistema.

Todo lo que ocurra después en H2 WhatsApp, H5 Panel de control y alertas dependerá de los datos creados en H1.

---

## Principio principal

> Si H1 no está bien construido, WhatsApp, IA, KPIs y reactivación no podrán funcionar correctamente.

Por eso H1 debe construirse antes que H2, H4, H5, Stripe o integraciones externas.

---

## Alcance de la Fase 1

Esta spec cubre el MVP inicial de H1.

Incluye:

- Gestión de clientes.
- Gestión de servicios.
- Gestión de citas.
- Gestión de cobros.
- Ficha de cliente.
- Historial de citas y cobros.
- Cierre de caja básico.
- Dashboard básico.
- Tags automáticos.
- Multi-tenancy.
- Validaciones principales.

No incluye todavía:

- WhatsApp real.
- Bot IA.
- Recordatorios reales.
- Stripe.
- Facturación automática SaaS.
- Publicación en redes.
- Panel avanzado H5.
- Importación CSV/Excel avanzada.
- App móvil nativa.

---

## Usuarios que usan H1

### business_owner

Puede:

- Crear clientes.
- Editar clientes.
- Crear servicios.
- Editar servicios.
- Crear citas.
- Editar citas.
- Cancelar citas.
- Cobrar citas.
- Ver caja.
- Ver dashboard.
- Marcar cliente como VIP.
- Configurar descuento VIP.
- Ver historial.

### staff

Puede, según permisos iniciales:

- Ver agenda.
- Crear citas.
- Editar citas.
- Cancelar citas.
- Ver clientes.
- Añadir notas.
- Registrar cobros.

No puede:

- Cambiar plan.
- Cambiar facturación SaaS.
- Eliminar negocio.
- Acceder a datos de otros negocios.

### onpilot_admin

Puede acceder desde backoffice interno, siempre con auditoría.

---

## Entidades principales

H1 usa estas entidades:

- Business.
- User.
- Client.
- Service.
- Appointment.
- Payment.
- ClientNote.
- AuditLog.

Todas las entidades operativas deben tener `businessId`.

---

## Clientes

### Campos mínimos

Un cliente debe tener:

- id.
- businessId.
- name.
- phone.
- email opcional.
- notes opcional.
- isVip.
- vipDiscountPercent.
- createdAt.
- updatedAt.
- deletedAt opcional.

### Reglas

- Un cliente pertenece siempre a un negocio.
- El `businessId` lo asigna el backend desde el usuario autenticado.
- No se debe aceptar `businessId` libremente desde frontend.
- El teléfono es obligatorio.
- El nombre es obligatorio.
- El email es opcional.
- No puede haber dos clientes activos con el mismo teléfono dentro del mismo negocio.
- Sí puede existir el mismo teléfono en negocios diferentes.
- El cliente no se elimina físicamente en MVP; se usa soft delete.
- Un cliente puede ser marcado como VIP.
- El descuento VIP debe ser un porcentaje entre 0 y 100.
- Las notas pueden autoguardarse en una fase posterior.

### Tags automáticos de cliente

El sistema puede calcular tags según actividad:

- `NEW`: cliente con 0 o 1 cita cobrada.
- `VIP`: cliente con `isVip = true`.
- `REACTIVATE`: cliente con más de 1 cita y sin visita reciente.
- `REGULAR`: cliente con varias citas.

En MVP los tags pueden ser calculados en backend, no necesariamente guardados.

---

## Servicios

### Campos mínimos

Un servicio debe tener:

- id.
- businessId.
- name.
- description opcional.
- basePrice.
- durationMinutes.
- isActive.
- createdAt.
- updatedAt.
- deletedAt opcional.

### Reglas

- Un servicio pertenece siempre a un negocio.
- El nombre es obligatorio.
- El precio base es obligatorio.
- El precio base no puede ser negativo.
- La duración es obligatoria.
- La duración debe ser mayor que 0.
- Un servicio inactivo no debe aparecer como opción principal al crear nuevas citas.
- No se debe borrar físicamente un servicio si ya tiene citas asociadas.

---

## Citas

### Campos mínimos

Una cita debe tener:

- id.
- businessId.
- clientId.
- serviceId.
- startsAt.
- endsAt.
- status.
- source.
- notes opcional.
- createdById.
- createdAt.
- updatedAt.
- cancelledAt opcional.
- cancellationReason opcional.

### Estados de cita

Estados iniciales:

```txt
SCHEDULED
CONFIRMED
COMPLETED
CANCELLED
NO_SHOW
```

### Sources de cita

Origen de la cita:

```txt
MANUAL
WHATSAPP
IMPORT
SYSTEM
```

En Fase 1 casi todas serán `MANUAL`.

### Reglas

- Una cita pertenece siempre a un negocio.
- Una cita pertenece a un cliente.
- Una cita pertenece a un servicio.
- No se pueden crear citas en fechas pasadas.
- `startsAt` debe ser anterior a `endsAt`.
- La duración puede calcularse desde el servicio.
- En MVP no debe haber dos citas activas solapadas para el mismo negocio si se asume una única agenda.
- Las citas canceladas no bloquean disponibilidad.
- Las citas `SCHEDULED` y `CONFIRMED` sí bloquean disponibilidad.
- Una cita cancelada debe conservarse en el historial.
- Una cita completada puede tener un cobro asociado.
- No se debe borrar físicamente una cita en MVP.

---

## Cobros

### Campos mínimos

Un cobro debe tener:

- id.
- businessId.
- clientId.
- appointmentId opcional.
- serviceId opcional.
- basePrice.
- vipDiscountAmount.
- manualDiscountAmount.
- finalPrice.
- paymentMethod.
- status.
- paidAt.
- createdById.
- createdAt.
- updatedAt.
- markedAsErrorAt opcional.
- errorReason opcional.

### Métodos de pago

Métodos iniciales:

```txt
CASH
CARD
BIZUM
TRANSFER
OTHER
```

### Estados de cobro

Estados iniciales:

```txt
PAID
ERROR
REFUNDED
```

En MVP se usará principalmente `PAID` y `ERROR`.

### Reglas

- Un cobro pertenece siempre a un negocio.
- Un cobro pertenece a un cliente.
- Un cobro puede pertenecer a una cita.
- El precio base viene del servicio, pero puede copiarse al cobro.
- El descuento VIP se aplica automáticamente si el cliente es VIP.
- El descuento manual lo introduce el profesional.
- El precio final se calcula en backend.
- El precio final no puede ser negativo.
- Un cobro confirmado no se elimina.
- Si hay error, se marca como `ERROR` con nota.
- Cada cobro alimenta:
  - Historial del cliente.
  - Caja.
  - KPIs básicos.
  - Futuro detector de reactivación.

---

## Ficha de cliente

La ficha de cliente debe mostrar:

- Datos básicos.
- Teléfono.
- Email.
- Estado VIP.
- Descuento VIP.
- Notas.
- Historial de citas.
- Historial de cobros.
- Total gastado.
- Número de visitas.
- Última visita.
- Próxima cita si existe.
- Tags calculados.

### Reglas

- Solo usuarios del mismo negocio pueden ver la ficha.
- La ficha debe cargar datos filtrados por `businessId`.
- Las notas no deben contener datos clínicos sensibles.
- Las acciones importantes deben poder auditarse.

---

## Agenda semanal

La agenda debe permitir:

- Ver citas por día.
- Navegar entre semanas.
- Crear cita.
- Editar cita.
- Cancelar cita.
- Ver estado de cita.
- Acceder a la ficha del cliente.
- Cobrar cita.

### Reglas

- Vista inicial: semana actual.
- Las citas deben ordenarse por hora.
- No se deben mostrar citas de otros negocios.
- Las citas canceladas pueden mostrarse con estado diferenciado o filtrarse según decisión de UI.
- La agenda no permite crear citas en pasado.

---

## Cobrar cita inline

Flujo:

1. Profesional abre una cita.
2. Pulsa cobrar.
3. Sistema carga servicio y precio base.
4. Sistema detecta si cliente es VIP.
5. Sistema aplica descuento VIP automático.
6. Profesional puede añadir descuento manual.
7. Sistema calcula total.
8. Profesional confirma cobro.
9. Backend crea Payment.
10. Backend marca cita como `COMPLETED`.
11. Dashboard y caja quedan actualizados.

### Reglas

- El cálculo del total se hace en backend.
- El frontend puede previsualizar el cálculo, pero no es fuente de verdad.
- Si el cliente es VIP, el descuento VIP se aplica automáticamente.
- El cobro no se puede eliminar.
- Si hay error, se marca como error con nota.

---

## Cierre de caja básico

Debe permitir consultar por rango de fechas:

- Facturación total.
- Número de cobros.
- Ticket medio.
- Top servicios por facturación.
- Top servicios por número de citas.
- Métodos de pago.
- Cobros marcados como error.

### Rango inicial

Filtros mínimos:

- Hoy.
- Semana.
- Mes.
- Rango personalizado.

---

## Dashboard básico

En Fase 1 el dashboard puede mostrar:

- Citas de hoy.
- Próximas citas.
- Facturación del día.
- Facturación del mes.
- Clientes nuevos del mes.
- Ticket medio.
- Servicios más realizados.
- Clientes a reactivar en versión simple.

---

## Clientes a reactivar en MVP

En Fase 1 se puede calcular de forma simple:

Cliente candidato a reactivación:

- Tiene más de 1 cita completada.
- No es VIP.
- No tiene citas futuras.
- Su última cita fue hace más de X días.

Valor default:

```txt
60 días
```

En Fase 2/H2 este cálculo alimentará mensajes de reactivación por WhatsApp.

---

## Validaciones principales

### Cliente

- `name` obligatorio.
- `phone` obligatorio.
- `email` válido si existe.
- `vipDiscountPercent` entre 0 y 100.
- Teléfono único por negocio.

### Servicio

- `name` obligatorio.
- `basePrice` >= 0.
- `durationMinutes` > 0.

### Cita

- `clientId` obligatorio.
- `serviceId` obligatorio.
- `startsAt` obligatorio.
- No crear en pasado.
- `startsAt < endsAt`.
- No solapamiento de citas activas en MVP.

### Cobro

- `clientId` obligatorio.
- `basePrice` >= 0.
- `manualDiscountAmount` >= 0.
- `vipDiscountAmount` >= 0.
- `finalPrice` >= 0.
- `paymentMethod` válido.

---

## Multi-tenancy obligatorio

Toda operación debe cumplir:

- Crear con `businessId` desde usuario autenticado.
- Leer filtrando por `businessId`.
- Actualizar filtrando por `businessId`.
- Borrar/soft delete filtrando por `businessId`.

Nunca aceptar `businessId` desde frontend como fuente de verdad.

---

## Auditoría recomendada

Registrar en `AuditLog`:

- Creación de cliente.
- Edición de cliente.
- Cambio de VIP.
- Creación de cita.
- Edición de cita.
- Cancelación de cita.
- Cobro confirmado.
- Cobro marcado como error.
- Creación/edición de servicio.

---

## Criterios de aceptación

H1 se considera MVP funcional cuando:

- Un negocio puede iniciar sesión.
- Un negocio puede crear clientes.
- Un negocio puede crear servicios.
- Un negocio puede crear citas.
- Un negocio puede ver agenda semanal.
- Un negocio puede cancelar citas.
- Un negocio puede cobrar citas.
- El cobro aplica descuento VIP si corresponde.
- La ficha de cliente muestra historial.
- La caja muestra facturación por período.
- El dashboard muestra KPIs básicos.
- Ningún usuario puede ver datos de otro negocio.
- Las validaciones principales funcionan.
- El backend no acepta `businessId` libremente desde frontend.
