# H2 — WhatsApp Automático (Bot de atención)

## Qué es

Bot que atiende el WhatsApp del negocio en piloto automático: responde dudas administrativas (horarios, servicios, precios autorizados), gestiona citas (consulta disponibilidad real, crea/cancela/reprograma con confirmación), envía recordatorios, y escala a humano cuando toca. Es el core del producto — "Onpilot en piloto automático".

Se apoya en la base de H1: la agenda, clientes, servicios y citas ya existen y están verificadas. El bot es un nuevo consumidor de esa lógica, no una reimplementación.

**Documento normativo del comportamiento del bot: `docs/09-ai-bot-rules.md`.** Este documento de feature define arquitectura y alcance; las reglas de conducta del bot viven allí y prevalecen.

## Requisitos de cumplimiento (v1, no negociables)

1. **Identificación proactiva como IA (AI Act Art. 50, aplica desde 2026-08-02).** El primer mensaje del bot en cada conversación nueva se identifica como asistente automático ("Soy el asistente automático de [negocio]…"). No basta con no ocultarlo si preguntan — es proactivo. Va en el prompt base y se verifica en testing.
2. **Uso auxiliar según política de Meta (vigente desde 2026-01).** El bot es un asistente auxiliar de negocio (reservas, recordatorios, FAQs del negocio). Los chatbots de propósito general están prohibidos en WhatsApp (solo Meta AI). El bot rechaza conversación general y redirige a las funciones del negocio. Es restricción de producto, no solo legal.
3. **Datos mínimos.** El bot no recibe información clínica, historial médico, datos de otros clientes ni de otros negocios (ya definido en 09). Multi-tenancy estricta: una conversación pertenece a un business y el contexto jamás cruza.
4. **RGPD (deuda DESTACADA, no bloquea el desarrollo).** Contrato de encargado del tratamiento con cada negocio + cifrado de datos en reposo, ANTES de captar clientes reales. Onpilot maneja datos personales y en sectores salud (fisio, psicología, dental) son de categoría especial.

## Alcance v1

### Oleada 1 — Backend completo del bot
- **Schema**: entidades nuevas `Conversation` y `Message` (con `businessId`, soft delete, UUID v7, mismas reglas de oro que H1). Estados de conversación del 09: `BOT_ACTIVE`, `PENDING_REVIEW`, `HUMAN_CONTROL`, `CLOSED`.
- **Integración WhatsApp Cloud API** (directa de Meta, sin BSP): webhook de recepción (verificación de firma), envío de respuestas, gestión de la ventana de 24h de sesión.
- **Motor de conversación**: Claude Haiku vía API de Anthropic. Prompt dinámico generado desde la configuración del negocio (identidad, sector, servicios, horarios, reglas, idioma, escalado — ver 09). Contexto: últimos 10-15 mensajes + resumen si es larga. Sin memoria entre llamadas: el backend envía todo el contexto en cada llamada.
- **Acciones sobre la agenda H1**: consultar disponibilidad real (nunca inventar huecos), crear cita tras confirmación explícita, cancelar/reprogramar según reglas del negocio. El flujo de 8 pasos del 09 (identificar servicio → preguntar preferencias → consultar disponibilidad → proponer → confirmar → crear → confirmar al cliente).
- **Escalado y estados**: detección de triggers de escalado (petición de humano, frustración, urgencia médica, 2 intentos fallidos, fuera de scope…) → transición a `PENDING_REVIEW`/`HUMAN_CONTROL`. En esos estados el bot NO responde.
- **Recordatorios**: Bull + Redis (el Redis del docker-compose por fin se usa). Job programado por cita, mensaje administrativo claro con CONFIRMAR/CANCELAR.
- **Logs y auditoría**: registro por mensaje (entrante, respuesta, bot-o-humano, motivo de escalado, tokens/coste aprox, businessId, conversationId). Extiende el AuditLog transversal de H1 donde aplique.

Verificación de la Oleada 1 sin frontend: WhatsApp real contra negocio de prueba + psql para estados/logs + curl para endpoints internos. Mismo estándar que H1.

### Oleada 2 — Panel mínimo de conversaciones (frontend)
- Lista de conversaciones con estado y última actividad.
- Vista de una conversación (mensajes, quién respondió: bot/humano).
- **Tomar control** (→ `HUMAN_CONTROL`, el profesional responde manualmente desde el panel) y **devolver al bot** (→ `BOT_ACTIVE`).
- Nada más en v1: sin métricas, sin configuración de personalidad desde UI, sin la UI rica del demo.

**Criterio de lanzable**: la v1 está completa cuando un negocio tiene el bot atendiendo por WhatsApp Y el profesional puede ver qué dice y quitarle el micrófono cuando quiera. Sin lo segundo, lo primero no toca cliente real.

## Fuera de alcance v1 (explícito)
- Configuración del bot desde el frontend (en v1: seed/BD).
- Reactivación proactiva de clientes (el motor de detección existe en H1 como conteo; la propuesta+aprobación+envío es v1.5).
- WhatsApp Flows (reserva con huecos en tiempo real dentro del chat) — evolución natural post-v1, alta prioridad v1.5/v2.
- Multicanal (email/SMS pacientes, Telegram profesional) — roadmap v2. Restricción de diseño AHORA: la lógica de conversación/recordatorios no se acopla a WhatsApp más de lo necesario (módulo de mensajería con adaptador WhatsApp, no llamadas a Meta esparcidas por el código).
- Pagos en chat, tick azul Meta Verified, plantillas HSM avanzadas.

## Arquitectura (alto nivel)

WhatsApp (cliente final)
↕ Cloud API de Meta (webhook entrante / send saliente)
apps/api — módulo messaging (NUEVO)
├─ WebhookController (verificación firma, dedupe, encolado)
├─ ConversationService (estados, contexto, persistencia)
├─ BotEngine (prompt dinámico + Claude Haiku + parseo de intención/acción)
│    └─ acciones → AppointmentsService / ClientsService (H1, existentes)
├─ WhatsAppAdapter (única pieza que habla con Meta; intercambiable)
└─ ReminderScheduler (Bull + Redis)

Decisiones de arquitectura que las specs deberán detallar (no cerrar aquí):
- Procesamiento del webhook: síncrono vs encolado (Meta exige responder 200 rápido → probablemente encolar y procesar en worker).
- Cómo expresa el bot sus acciones: tool use de la API de Anthropic vs parseo de JSON en la respuesta.
- Idempotencia de mensajes entrantes (Meta reintenta webhooks).
- Registro de app en Meta for Developers: **iniciarlo YA** — el proceso tarda (aviso del documento técnico). No bloquea el desarrollo (se puede desarrollar contra el sandbox/número de prueba).

## Modelo de datos (tentativo, la spec de schema lo cierra)

- `Conversation`: id, businessId, clientId (nullable — puede escribir un desconocido), phone, status (enum 4 estados), lastMessageAt, resumen de contexto, timestamps + soft delete.
- `Message`: id, businessId, conversationId, direction (IN/OUT), author (CLIENT/BOT/HUMAN), body, waMessageId (idempotencia), metadata (tokens/coste), timestamps.
- Posible `BotConfig` por negocio (personalidad, reglas, precios autorizados) — o campos en Business; la spec de schema decide.

## Desglose tentativo de tareas (cada una con su ciclo spec→plan→check→commit)

Oleada 1:
1. Schema + migración (Conversation, Message, enums, índices, constraints SQL manuales si aplican).
2. Registro Meta + webhook de recepción (verificación, dedupe, persistencia de mensaje entrante) — sin bot aún.
3. WhatsAppAdapter de envío + eco manual de prueba (recibir→persistir→responder fijo).
4. BotEngine v0: prompt dinámico + Haiku, solo conversación informativa (horarios/servicios/precios autorizados), identificación como IA, sin acciones de agenda.
5. Acciones de agenda: disponibilidad + creación con confirmación (el flujo de 8 pasos).
6. Cancelar/reprogramar + estados de escalado completos.
7. Recordatorios (Bull + Redis) + logs/auditoría/costes.

Oleada 2:
8. Panel de conversaciones (lista + detalle) — sobre el layout workspace.
9. Tomar control / devolver al bot + respuesta manual.

El orden exacto y el tamaño de cada tarea se ajustará al hacer las specs; esto es el mapa.

## Relación con el layout workspace (frontend fase 3)

El workspace con sidebar (acordado para "cuando vayamos a H2") es prerequisito de la Oleada 2, no de la 1. Puede hacerse en paralelo a la Oleada 1 o justo antes de la tarea 8. El panel de conversaciones nace ya dentro de la estructura de navegación buena.

## Riesgos y dependencias

- **Meta for Developers**: alta de app y número — tarda semanas, iniciar ya.
- **Cumplimiento con fecha**: identificación como IA operativa antes del 2026-08-02 (la tarea 4 la incluye de serie).
- **Costes de IA**: Haiku es barato pero medir desde el día 1 (metadata de tokens en Message). Prompt caching cuando el volumen lo justifique (fase 4 del doc técnico).
- **Dependencia de Meta**: mitigada por diseño con el WhatsAppAdapter (canal como capa intercambiable). Multicanal real es v2.
- **RGPD**: deuda DESTACADA antes de clientes reales (contrato encargado del tratamiento + cifrado en reposo).




