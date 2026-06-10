# Onpilot — Security Rules

## Objetivo

Onpilot gestiona datos de negocios locales y datos personales de clientes finales.

La seguridad debe estar presente desde el inicio del desarrollo.

Regla principal:

> La seguridad no se añade al final. Se diseña desde la primera fase.

---

## Posición legal

Onpilot actúa como Encargado del Tratamiento.

El negocio cliente actúa como Responsable del Tratamiento.

Esto significa:

- Los datos de los clientes finales pertenecen al negocio.
- Onpilot procesa esos datos siguiendo instrucciones del negocio.
- Onpilot debe ofrecer garantías técnicas y organizativas.
- Onpilot debe firmar un DPA o contrato de encargo de tratamiento con cada negocio cliente.

---

## Datos personales tratados

Onpilot puede almacenar:

- Nombre.
- Teléfono.
- Email.
- Citas.
- Servicios contratados.
- Historial de visitas.
- Notas administrativas.
- Mensajes de WhatsApp relacionados con gestión de citas.
- Cobros.
- Preferencias del cliente.
- Estado VIP o tags comerciales.

---

## Datos que no se deben almacenar

En sectores como fisioterapia, psicología, dental o salud, Onpilot no debe almacenar:

- Diagnósticos.
- Historial clínico.
- Informes médicos.
- Tratamientos médicos detallados.
- Datos de salud explícitos.
- Evaluaciones psicológicas.
- Medicación.
- Documentos clínicos.

Onpilot debe posicionarse como herramienta de gestión, agenda y comunicación, no como historia clínica.

---

## Autenticación

El sistema usará:

- Email + password.
- JWT access token.
- Refresh token.
- Expiración corta del access token.
- Refresh token revocable.

Los passwords deben guardarse siempre hasheados.

Opciones permitidas:

- Argon2.
- bcrypt.

Nunca se debe guardar una contraseña en texto plano.

---

## Tokens

Los access tokens deben tener vida corta.

Los refresh tokens deben:

- Guardarse hasheados si se almacenan.
- Poder revocarse.
- Rotarse cuando sea necesario.
- Invalidarse en logout.

---

## Variables de entorno

Las claves sensibles nunca deben estar en Git.

Ejemplos:

- DATABASE_URL.
- JWT_SECRET.
- REFRESH_TOKEN_SECRET.
- CLAUDE_API_KEY.
- META_APP_SECRET.
- META_ACCESS_TOKEN.
- STRIPE_SECRET_KEY.
- RESEND_API_KEY.
- ZERNIO_API_KEY.
- REDIS_URL.

Deben ir en:

```txt
.env
```

El archivo `.env` debe estar incluido en `.gitignore`.

---

## Cifrado

### En tránsito

Todo el tráfico en producción debe usar HTTPS/TLS.

### En reposo

Datos sensibles o tokens externos deben cifrarse antes de guardarse.

Tokens que deben protegerse especialmente:

- Tokens de WhatsApp Cloud API.
- Tokens de Meta.
- Tokens de TikTok.
- Tokens de Zernio.
- Refresh tokens internos.

---

## Roles

Roles iniciales:

```txt
onpilot_admin
business_owner
staff
```

Cada endpoint debe definir qué roles pueden acceder.

Ejemplo:

- Solo `business_owner` puede modificar facturación.
- Solo `business_owner` puede conectar integraciones.
- `staff` puede crear citas si tiene permiso.
- `onpilot_admin` puede gestionar negocios desde backoffice.

---

## Permisos por herramienta

Cada negocio puede tener activas o no las herramientas:

```txt
H1_AGENDA_CLIENTES
H2_WHATSAPP_AUTOMATICO
H4_CONTENIDO_REDES
H5_PANEL_CONTROL
```

Antes de acceder a una feature, el backend debe verificar:

1. Usuario autenticado.
2. Usuario pertenece al negocio.
3. Negocio tiene la herramienta activa.
4. Usuario tiene rol o permiso suficiente.

---

## Multi-tenancy

La seguridad depende directamente del aislamiento entre negocios.

Regla obligatoria:

> Toda query de datos operativos debe filtrar por `businessId`.

Nunca se debe confiar en IDs enviados desde frontend sin verificar pertenencia al negocio.

---

## Validación de datos

Todo input recibido desde frontend, webhooks o APIs externas debe validarse.

En backend se usarán DTOs y validaciones.

En frontend se usará Zod.

Ejemplos de validación:

- Email válido.
- Teléfono válido.
- Fecha válida.
- No permitir citas en pasado.
- Precio numérico.
- Estado permitido.
- Strings con longitud máxima.

---

## Sanitización

Todo dato que luego se muestre en frontend debe tratarse como no confiable.

Especial cuidado con:

- Notas de clientes.
- Mensajes de WhatsApp.
- Captions generados.
- Nombres introducidos por usuarios.
- Textos libres.

---

## Rate limiting

Endpoints sensibles deben tener rate limiting.

Especialmente:

- Login.
- Registro.
- Recuperación de contraseña.
- Webhooks.
- Generación IA.
- Envío de mensajes.
- Subida de archivos.

---

## Auditoría

Debe existir `AuditLog` para acciones importantes.

Registrar:

- userId.
- businessId.
- action.
- resourceType.
- resourceId.
- ip si está disponible.
- userAgent si está disponible.
- timestamp.
- metadata.

Acciones a auditar:

- Login.
- Logout.
- Cambio de password.
- Creación de usuario.
- Eliminación de usuario.
- Cambio de roles.
- Activación/desactivación de herramientas.
- Conexión de WhatsApp.
- Conexión de redes.
- Cambios en configuración del bot.
- Cambios de facturación.
- Borrado de datos.
- Exportación de datos.

---

## Webhooks

Los webhooks deben verificarse siempre que la plataforma externa lo permita.

Ejemplos:

- Meta.
- Stripe.
- TikTok.
- Zernio.

Reglas:

- Verificar firma del webhook.
- No confiar en payloads sin validar.
- Resolver `businessId` antes de procesar.
- Registrar errores.
- Evitar duplicados mediante ids externos.
- Responder rápido y procesar en background si hace falta.

---

## IA y seguridad

La IA no debe tener libertad absoluta.

Reglas:

- El bot no puede dar consejo médico.
- El bot no puede prometer precios no configurados.
- El bot no puede inventar disponibilidad.
- El bot no puede crear citas sin confirmación del cliente.
- El bot no puede acceder a datos de otro negocio.
- El bot debe escalar a humano en casos dudosos.

---

## RGPD

El sistema debe contemplar:

- Derecho de acceso.
- Derecho de rectificación.
- Derecho de supresión.
- Derecho al olvido.
- Exportación de datos.
- Eliminación de datos al cancelar.
- Registro de brechas.
- DPA con clientes.
- DPA con proveedores.

---

## Retención de datos

Cuando un negocio cancela:

- Sus datos deben bloquearse o eliminarse según contrato.
- Por defecto, eliminación en 30 días.
- Se debe evitar conservar datos personales innecesarios.

---

## Backups

Los backups deben:

- Estar protegidos.
- No estar disponibles públicamente.
- Tener política de retención.
- Poder restaurarse.
- No compartirse con terceros no autorizados.

---

## Errores

Los errores no deben exponer información sensible.

No mostrar al usuario:

- Stack traces.
- DATABASE_URL.
- Tokens.
- Claves API.
- Queries internas.
- Información de otros tenants.

---

## Checklist de seguridad para cada feature

Antes de implementar una feature, revisar:

- ¿Qué datos personales toca?
- ¿Tiene `businessId`?
- ¿Qué roles pueden acceder?
- ¿Necesita herramienta activa?
- ¿Valida input?
- ¿Puede exponer datos de otro negocio?
- ¿Necesita AuditLog?
- ¿Usa tokens externos?
- ¿Necesita cifrado?
- ¿Tiene riesgo de abuso?
- ¿Necesita rate limit?
- ¿Hay implicaciones RGPD?

---

## Regla final

Si una feature toca datos personales o integraciones externas y no tiene medidas claras de seguridad, no debe pasar a implementación.
