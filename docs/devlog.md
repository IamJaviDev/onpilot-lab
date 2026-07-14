# Onpilot — Devlog

Bitácora de desarrollo del proyecto. Cada tarea cerrada deja aquí un asiento breve
con qué se hizo, las decisiones clave y la deuda que arrastra.

Este archivo es la **memoria del proyecto**: lo que no esté aquí (o en otro archivo
del repo) no existe para Claude Code en futuras sesiones. El historial de Git cuenta
*qué* cambió; el devlog cuenta *por qué* y *qué queda pendiente*.

No sustituye al `/review` (ese es el resumen completo en la terminal). Aquí va el
**destilado**: tras cada `/review` y su commit, se añade un asiento nuevo arriba del
todo y se actualiza la sección de deuda.

---

## Deuda técnica abierta

Lista viva. Cuando algo se resuelve, se marca y se mueve al asiento de la tarea que
lo cerró.

### Seguridad / infraestructura (antes de producción)
- [ ] **trust proxy sin configurar (DESTACADA).** Sin `trust proxy`, el rate limiting por IP
  no protege bien en producción tras el proxy (Railway) ni desde el navegador vía los rewrites
  de Next: todas las peticiones aparentan venir de la IP del proxy (un cubo compartido).
  Configurar correctamente antes de producción; hacerlo mal permite spoofing de
  `X-Forwarded-For`. _(Generado en Rate limiting, 01/07/26.)_
- [ ] **Storage del throttler en memoria.** Mono-instancia. Migrar a Redis si se escala a
  multi-instancia. _(Generado en Rate limiting, 01/07/26.)_
- [ ] **RolesGuard pendiente.** Autorización por rol (owner vs staff). Necesario cuando
  exista gestión de staff; hoy solo hay owners. _(Generado en Clients.)_
- [ ] **Consulta/lectura de AuditLog.** Endpoint GET + pantalla para ver el historial de
  auditoría. Diferida, acoplada al futuro RolesGuard (quién puede verla). _(Generado en AuditLog, 01/07/26.)_
  - [ ] **Higiene de secretos pendiente.** Rotar verify token del webhook y regenerar el token
  temporal del panel (ambos expuestos en chat de trabajo). App Secret ya restablecido.
  **Nota (14/07/26): evaluado y APARCADO de momento** — blast radius casi nulo (el verify token
  solo interviene en el handshake de suscripción, la recepción se autentica por HMAC; el token
  temporal ya está muerto por su caducidad de 24h). Retomar por higiene cuando convenga, sin urgencia.
  _(Generado en H2 T2-T3, 06/07/26.)_
  - [ ] **RGPD antes de clientes reales (DESTACADA).** Contrato de encargado del tratamiento con
  cada negocio + cifrado de datos en reposo. Requiere entidad legal. Bloquea lanzamiento, no
  desarrollo. _(Generado en doc de feature H2, 04/07/26.)_


### Backend / datos
- [ ] **Índice redundante de teléfono.** `Client_businessId_phone_idx` (no único,
  autogenerado del schema) está solapado por el parcial único
  `Client_businessId_phone_active_idx`. Eliminar el no-único en una futura tarea que
  toque el schema. _(Generado en Tarea 2.)_
- [ ] **Bloqueo de soft-delete de servicio con citas.** No permitir borrar un servicio
  que tenga citas asociadas. Ya existe Appointments → accionable. _(Generado en Services.)_
- [ ] **Race teórica de solapamiento de citas.** El check+insert va en `$transaction`
  pero sin constraint de exclusión de Postgres (btree_gist). Para MVP es teórica; si se
  vuelve real, añadir el constraint vía migración SQL. _(Generado en Appointments.)_
- [ ] **Cobro de importe libre sin servicio.** No soportado en MVP: todo cobro exige un
  servicio como origen del basePrice. Decisión de producto futura. _(Generado en Payments.)_
- [ ] **Cita activa vencida sin cerrar.** Una cita SCHEDULED/CONFIRMED con `startsAt` ya
  pasado no aparece ni en próximas ni en historial de la ficha. Aceptable MVP.
  _(Generado en Ficha enriquecida, 01/07/26.)_
   [ ] **Normalización de teléfonos H1↔E.164.** H1 puede guardar teléfono local ("600…") y Meta
  manda internacional ("34600…"); si no casan, la vinculación Conversation→Client queda en
  clientId null (seguro pero pierde el enlace). Unificar formato.
  **Matiz (14/07/26): el `+` inicial NO rompe** — un Client con `+34…` recibió su recordatorio sin
  problema (Meta aceptó y devolvió wamid). El riesgo real está en los formatos LOCALES ("6XX…") que
  no casan con el internacional de Meta. _(Generado en H2 T2, 05/07/26.)_
- [ ] **Conversación fantasma de test (+34600000000) en BD.** Cerrarla (CLOSED) o asumirla como
  historial de test. _(Generado en H2 T3, 06/07/26.)_
- [ ] **13 tests no deterministas en `bot-tools.service.spec.ts`.** Dependen del reloj real (fijan
  expectativas para 2026-07-13 pero calculan huecos con la fecha actual → pasan o fallan según el
  día de ejecución). Confirmado con git stash que fallan en main sin relación con ningún fix. Fix:
  inyectar fecha/now fija (mock de DateTime.now o parámetro) para hacerlos deterministas.
  _(Generado en Fix de fechas relativas, 13/07/26.)_
  - [ ] **`baseUrl` deprecado en apps/api/tsconfig.json (:16).** TypeScript avisa de que dejará de
  funcionar en TS 7.0 (hoy solo warning del editor; typecheck/build pasan). Migrar (paths sin baseUrl)
  o silenciar con `ignoreDeprecations` cuando se acerque TS 7. Sin urgencia. _(Detectado en fix de tests, 14/07/26.)_

### IA / Bot (H2)
- [ ] **Plantilla HSM para recordatorios fuera de ventana (DESTACADA).** El recordatorio 24h
  es texto libre; si el cliente lleva >24h sin escribir, Meta lo rechaza con 131047 (ventana
  cerrada) — el caso típico de un recordatorio. El processor lo marca completado-con-fallo (no
  reintenta: la ventana no se abre sola), pero el cliente NO recibe nada. Solución real: plantilla
  HSM aprobada de re-engagement. Bloquea el valor del recordatorio en producción, no el desarrollo.
  _(Generado en H2 T7, 08/07/26.)_
- [ ] **Antelación del recordatorio fija en 24h.** Constante `REMINDER_LEAD_HOURS` con comentario
  "futuro BotConfig"; configurable por negocio cuando exista BotConfig. _(Generado en H2 T7, 08/07/26.)_
- [ ] **Fallo TOTAL de Claude = silencio (solo sin efecto).** Mitigada en T6: tras una tool CON
  EFECTO ok (crear/cancelar/escalar), el silencio (vacío/refusal/fallo SDK) produce texto fijo
  desde los tool_results. Queda el caso sin efecto (fallo antes de actuar): el cliente no
  recibe nada (solo log); mensaje de cortesía pendiente. _(Generado en H2 T4, 07/07/26;
  retries resueltos en T5; silencio post-efecto resuelto en T6, 08/07/26.)_
- [ ] **Devolución PENDING_REVIEW → BOT_ACTIVE solo por psql.** El bot nunca se auto-reactiva
  (por diseño); la devolución manual es psql hasta el panel de conversaciones (Oleada 2).
  _(Generado en H2 T6, 08/07/26.)_
- [ ] **Reservas para terceros (producto).** Hoy: 1 Client por teléfono; el nombre del tercero
  se conserva como nota en la cita ("Reserva a nombre de: X (vía WhatsApp)") — paliativo.
  Soporte real de múltiples personas por teléfono: decisión de producto futura.
  _(Generado en H2 T5, 07/07/26.)_
- [ ] **Horario semanal solo por psql.** `Business.weeklySchedule` no tiene UI de configuración
  (llegará con H5); seed/cambios a mano según §9 del doc de setup. _(Generado en H2 T5, 07/07/26.)_
- [ ] **Heurística anti-fantasma: evolución a marcador estructural.** Desde T6 cubre 3
  pretensiones (reserva/cancelación/escalado). Si resulta ruidosa en producción (p. ej. un
  "el equipo te atenderá" cortés degradando a escalado real), evaluar código de operación en el
  tool_result que el texto legítimo deba citar. Medible vía `metadata.phantomGuard`.
  _(Generado en H2 T5, 07/07/26; extendida en T6, 08/07/26.)_
- [ ] **Referencia corta de cita si el ordinal reincide.** El modelo tendió a usar el número de
  orden del listado como appointmentId; mitigado en T6 (prompt + aviso en tool_result +
  validación de shape). Si reincide, evaluar referencia corta re-mapeada (exige estado por
  conversación). Medible por errores "appointmentId inválido" en logs. _(Generado en H2 T6, 08/07/26.)_
- [ ] **contextSummary sin implementar.** Ventana fija de 10 mensajes; en conversaciones largas
  el bot pierde el contexto anterior. El campo ya existe en Conversation. _(Generado en H2 T4, 07/07/26.)_
- [ ] **Prompt caching diferido.** El system prompt se reconstruye (y se factura entero) en cada
  request; cachear cuando el volumen lo justifique (fase 4 del doc técnico). _(Generado en H2 T4, 07/07/26.)_

### Frontend / UX
- [ ] **Markdown de WhatsApp crudo en las burbujas del panel.** Los `*negrita*` de WhatsApp se
  muestran con asteriscos literales en el hilo del panel de conversaciones; parsear a `<strong>`.
  _(Generado en H2 T8, 09/07/26.)_
- [ ] **Ficha enriquecida sin tags por actividad.** `computeTags` solo da VIP/NEW. Los tags
  derivados de comportamiento (REACTIVATE/REGULAR) quedaron fuera. _(Generado en Ficha enriquecida, 01/07/26.)_
- [ ] **Gráfico "facturación últimos 6 meses" (Caja/Dashboard).** Requiere serie temporal
  que ningún endpoint da (endpoint nuevo o N llamadas). _(Generado en Caja.)_
- [ ] **"Últimas transacciones" en Caja.** Requiere GET /payments por rango; /cash/summary
  solo da agregados. _(Generado en Caja.)_
- [ ] **Desglose del cobro en cita COMPLETED.** El detalle de una cita cobrada solo muestra
  el badge "Cobrada", no el desglose del pago (requeriría GET /payments por cita).
  _(Generado en Agenda Pieza 3.)_
- [ ] **Buscador de cliente en formulario de cita.** El selector usa `<select>` con
  limit:100; si la base supera ~100, se queda corto. Sustituir por input con búsqueda
  cuando crezca. _(Generado en Agenda Pieza 2.)_
- [ ] **Edición de notas de cliente sin autosave.** Se editan vía modal, no inline como el
  mockup. Decisión de scope. _(Generado en frontend Clientes.)_
- [ ] **Logout en móvil (placement visual).** Placement exacto pendiente de validación
  visual fina contra el mockup. _(Generado en frontend layout + navegación.)_
- [ ] **CSRF token en Auth.** El refresh va en cookie httpOnly con `sameSite:'strict'`
  (mitigación suficiente para MVP). Si se relaja a `lax`/`none`, añadir CSRF explícito.
  _(Generado en frontend-auth.)_
  - [ ] **Date-picker de salto rápido en Agenda.** Eliminado con la vista semanal; reintroducir
  (llevando a semana+día) si se echa en falta. _(Generado en Vista semanal, 04/07/26.)_
- [ ] **Flecos de design tokens.** Nav de agenda a 8px vs tarjetas 18px; `bg-white` sobre fondo
  cálido; ficha de cliente sin tipografía KPI 800; botones secundarios sin restylear. Todos
  menores, reevaluar si cantan. _(Generado en Design tokens T2-T3, 04/07/26.)_
   - [x] **Refinamiento de design tokens del frontend.** _(→ Design tokens 1-3, 04/07/26.)_


## Deuda cerrada

- [x] **Scripts de Prisma.** _(Tarea 2 → Tarea 3.)_
- [x] **ConfigModule.** _(Tarea 4 → Auth-2.)_
- [x] **Ficha enriquecida de cliente.** Stats, historial de citas/cobros, próximas citas.
  _(Clients → Ficha enriquecida, 01/07/26.)_
- [x] **Inconsistencia doc: GET /appointments {items} vs array pelado.** _(Agenda P1 → microtareas docs, 01/07/26.)_
- [x] **Inconsistencia doc: 10-development-workflow sin REVISIÓN/APROBACIÓN.** _(Tarea 2 → microtareas docs, 01/07/26.)_
- [x] **AuditLog transversal.** Escritura de las 16 acciones (auth, clientes, servicios, citas, cobros).
  _(5 fuentes → AuditLog, 01/07/26.)_
- [x] **Rate limiting en Auth.** login 5/min, register 3/min, refresh 10/min. _(Auth-1 → Rate limiting, 01/07/26.)_
- [x] **Verificación en vivo de T7 (recordatorios).** Las 3 pruebas pendientes (limpieza de job al
  cancelar / disparo diferido + envío / resiliencia Redis caído). _(→ Verificación en vivo T7, 14/07/26.)_

## Convenciones / Notas permanentes

No son deuda (no se cierran); son recordatorios vivos del proyecto.

- **Invariantes invisibles a Prisma.** El índice único parcial de teléfono y los 8 CHECK
  de rango viven solo en el SQL de la migración; Prisma no los introspecta. Cualquier cambio
  se edita a mano en una nueva migración. **No declarar en `schema.prisma`.** _(Tarea 2.)_
- **Convención monetaria (regla de oro).** El dinero se calcula SIEMPRE en backend con
  Decimal; el `number` de las respuestas de la API es solo para display, jamás para
  recalcular. _(Services.)_

  ### Docs
- [ ] **05-database-model.md desfasado.** Describe un diseño PREVIO de mensajería distinto al
  construido (externalPhone/senderType/channel). Alinear en microtarea; decidir si `channel`
  vuelve en v2 multicanal o queda como concepto del adapter. _(Generado en H2 T1, 04/07/26.)_
- [ ] **h2-webhook-setup.md §8: UPDATE por id explícito.** Añadir "listar conversaciones y apuntar
  el id" a la prueba de estados (evita el tropiezo de la conversación fantasma). _(Generado en H2 T3, 06/07/26.)_



## Asientos

### 2026-07-14 — #6: renderizar negrita de WhatsApp en las burbujas del panel

**Qué se hizo.** El hilo del panel pintaba el body con `{message.body}` a pelo, así que los marcadores de negrita del bot salían con asteriscos crudos. Ahora un helper puro tokeniza la negrita a nodos React y las burbujas la muestran renderizada. Cierra la deuda "markdown de WhatsApp crudo en las burbujas" (abierta en T8).

**Datos reales que guiaron el alcance** (294 mensajes en BD): 74 OUT con negrita en DOS convenciones — `*simple*` (plantilla de recordatorio, 3 msgs) y `**doble**` (texto libre de Claude, 71 msgs); los IN del cliente son texto plano. Cursiva (`_`), tachado (`~`) y monoespaciado NO aparecen nunca → no se soportan (alcance muerto). Saltos de línea ya funcionaban (whitespace-pre-wrap) → se preservan.

**Decisiones clave.**
- **Nodos React, no HTML (garantía anti-XSS por construcción).** `renderMessageBody(body): ReactNode[]` (helper puro en `lib/conversations/render-message-body.tsx`) tokeniza con una regex de alternación (`\*\*([^*]+)\*\*|\*([^*]+)\*`, `**` ANTES que `*`) y devuelve fragmentos de texto + `<strong>`. Cero `dangerouslySetInnerHTML`, cero string HTML intermedio. El body arbitrario del cliente sigue escapado por React → no puede interpretarse como HTML. Verificado en vivo: un `<b>hola</b>` enviado por WhatsApp se muestra como TEXTO LITERAL en el panel, no ejecutado.
- **Ambas convenciones de negrita** cubiertas con `{m[1] ?? m[2]}` (grupo doble, o simple si undefined). Un parser de solo `*` habría roto los 71 `**...**` del bot.
- `[^*]+` exige contenido no vacío sin asteriscos internos → los casos límite (asterisco suelto sin cerrar, `**`/`****` vacío) no matchean y caen a texto literal, sin crashear.
- `m.index ?? last` para apaciguar el posible-undefined de TS sin cambiar la lógica.
- Sin dependencias (react-markdown sería peso injustificado para `*` y `**`). `message-bubble.tsx` solo cambia el contenido del `<p>`, manteniendo `whitespace-pre-wrap break-words` → saltos intactos.

**Comportamiento conocido (no bug).** Un caso raro tipo `*uno * dos*` (asterisco intermedio en negrita simple) matchea greedy y pinta negrita donde quizá no se quería. No aparece en los 294 mensajes reales (IN texto plano, OUT bien formados), no crashea ni abre XSS → aceptable por datos reales.

**Verificación.** lint/typecheck/build de apps/web en verde (11 rutas); diff solo 2 archivos. Visual (Javier, navegador): recordatorios con `*...*` en negrita, texto plano del cliente igual, saltos respetados. **Seguridad dirigida (la crítica):** `<b>hola</b>` por WhatsApp → aparece literal en el panel, no renderizado. apps/web sigue sin runner de tests (deuda T9); el helper queda aislado y testeable para cuando exista.

**Commit.** `feat(web): renderizar negrita de WhatsApp en las burbujas del panel`

**Deuda cerrada.** ✅ Markdown de WhatsApp crudo en las burbujas del panel.


### 2026-07-14 — FIX: tests deterministas en bot-tools.service.spec.ts (reloj fijo)

**Qué se hizo.** Los tests de `bot-tools.service.spec.ts` dependían del reloj real: fijaban expectativas para fechas ancladas a "hoy" (`MONDAY = '2026-07-13'` + dos más) mientras el código bajo test lee el reloj del sistema —luxon `DateTime.now()` (bot-tools.service.ts:322, :431) y `new Date()` (:352, :561, :649)—, así que pasaban o fallaban según el día de ejecución. Firma del bug: el 13/07 fallaban 13; el 14/07 ya fallaban 16 — el conteo dependía del día. Fix: reloj fijo en el spec, sin tocar producción.

**Decisiones clave.**
- **Mock de spec, no inyección en producción.** El `DateTime.now()` directo de las tools es correcto en producción (alimenta guards "¿ya pasó?", no es conducta que necesite control determinista como el `nowZoned` del engine). Refactorizar para inyectar `now` habría sido ampliar alcance sin necesidad. Descartado explícitamente.
- **Cubrir AMBAS fuentes de reloj.** El código usa luxon Y `Date` nativo; el mock fija los dos al mismo instante: `Settings.now = () => FIXED_TS` (luxon, que los fake timers de Jest NO tocan) + `jest.useFakeTimers({ now: FIXED_TS, doNotFake: [...todo salvo Date] })`. El `doNotFake` es deliberado: fingir setTimeout/microtasks colgaría los awaits del código async; solo se finge `Date`/`Date.now()`.
- **FIXED_TS = 2026-07-10 09:00 Europe/Madrid**, construido con luxon (`DateTime.fromISO(...).toMillis()`) para ser DST-safe (julio = verano, UTC+2). Elegido anterior al 12/07 para que las tres anclas (12, 13, 14 jul) sean todas futuro respecto al now fijo, que es lo que sus tests prometen.
- `beforeEach`/`afterEach` a nivel de archivo; teardown restaura AMBOS relojes (`Settings.now` real + `useRealTimers()`). Comentario en el spec advirtiendo de no volver a anclar tests a fechas relativas.

**Verificación.** 44/44 en el archivo (antes 16 fallando). Suite completa 238/238 (15 suites) → el mock no se filtra a otros specs, corroborado empíricamente: los specs de ReminderProcessor loguean la fecha real (07/14) mientras bot-tools opera a 07/10 en la misma corrida. lint/typecheck/build verde (api + web). **Punto clave verificado explícitamente:** el test "fallo inesperado → error genérico" ejercita la ruta REAL del throw (llega a `appointmentsCreate` que lanza, entra al catch, devuelve el genérico), no un atajo del guard de hora — confirmado por el log `07/10/2026 9:00 ERROR [BotToolsService] ... failed unexpectedly / Error: db down` (timestamp del reloj fijo). Fix no superficial. Determinismo: argumento de construcción (ninguna ruta consulta otro reloj que el fijado) + corroboración de la suite; `libfaketime` no disponible en macOS.

**Commit.** `test(api): tests deterministas en bot-tools.service.spec.ts (reloj fijo del spec)`

**Deuda cerrada.** ✅ 13 tests no deterministas en bot-tools.service.spec.ts (eran 16 el día del fix).

### 2026-07-14 — Verificación en vivo de T7 (recordatorios) + retirada de flags de prueba

**Qué se hizo.** Cerrada la verificación en vivo pendiente de T7 (las 3 pruebas anotadas el 08/07), y retirados los flags de prueba de recordatorios del .env de desarrollo. Sin cambios de código: T7 ya estaba en main; esta sesión solo ejerció el comportamiento ya implementado y confirmó los tres contratos en vivo.

**Las 3 pruebas (verificadas por Javier).**
- **(a) Limpieza del job al cancelar.** Cita creada por web → job programado en Redis con `jobId = appointmentId` (`bull:appointment-reminders:019f6176-…` verificado con `redis-cli keys`) → cancelada por web → la key del job desaparece. El gancho de `cancel` (H1) llama a `RemindersService.cancel(appointmentId)` y BullMQ borra el job por su jobId determinista. ✅
- **(c) Disparo diferido + envío (el tramo nunca probado en vivo).** Con `REMINDERS_LEAD_MINUTES=5`, cita a +10 min → el processor disparó solo tras el delay, releyó la cita, compuso el texto y lo envió por WhatsApp. **Recordatorio recibido en el móvil.** Evidencia dura en psql: Message OUT/BOT con `metadata { reminder: true, appointmentId: "019f618e-…" }` y `waMessageId` real de Meta. El texto compuso hora en zona del negocio ("a las 19:06") y referencia relativa correcta ("tu cita de hoy"). ✅
- **(b) Resiliencia Redis caído ("Redis caído ≠ citas rotas").** `docker stop onpilot_redis` → cita creada por web (`019f619f-…`) → **se crea igual y viva** (visible en Appointment, sin `deletedAt`), respondiendo rápido. En el log: `Error: Stream isn't writeable and enableOfflineQueue options is false` — el producer falla al instante (no cuelga el await) y el fallo de `schedule` queda capturado sin propagarse; el ruido en cascada de ECONNREFUSED es el Worker reintentando (retryStrategy). `docker start onpilot_redis` → el Worker reconecta solo y el log vuelve a la calma. ✅

**Hallazgo (favorable) sobre la deuda H1↔E.164.** El Client del recordatorio tenía el teléfono con `+` (`+34644207040`); temíamos que el `+` rompiera el envío. No lo rompe: Meta aceptó y devolvió wamid, y el mensaje llegó. La deuda de normalización sigue abierta (los formatos locales "6XX…" sí romperían el matching conversación↔Client), pero por esta vía el `+` no es el problema — matiz añadido a la deuda.

**Verificación cruzada de rebote.** En la misma sesión, "¿cerráis el lunes?" → "no, abrimos L-V, el domingo es el único día que cerramos": el fix del mini-calendario del 13/07 aguantando en vivo.

**Retirada de flags (punto #2 del Camino A).** Eliminada la línea `REMINDERS_LEAD_MINUTES` del .env de dev (era override solo-pruebas: forzaba disparo a 5 min en vez de 24h). `REMINDERS_ENABLED` → false en dev (T7 ya verificado; evita ruido de jobs/Redis en el log durante el trabajo normal; reactivable puntualmente). Arranque de la API confirmado sin el WARN de `REMINDERS_LEAD_MINUTES`. Cambio en .env (gitignored) → sin commit de código.

**Herramienta de sesión.** Adoptado Prisma Studio (`pnpm --filter api exec prisma studio`) como visor de BD para inspección de filas durante la verificación — cómodo para Client/Conversation/Message/Appointment; el log del processor (wamid) se sigue leyendo en la terminal de `pnpm dev:api`.

**Commit.** Solo devlog (docs). La verificación en vivo y el ajuste de .env no generan commit de código.

**Deuda.** Cerrada la "verificación en vivo de T7 pendiente" (los 3 puntos). Sigue abierta la normalización H1↔E.164 (con matiz: el `+` no rompe, los formatos locales sí). Resto del Camino A pendiente: 13 tests no deterministas, docs (05-database-model + §8), markdown en burbujas del panel — todos ya en el listado de deuda de arriba. Higiene de secretos: aparcada por decisión (nota en la deuda).

### 2026-07-13 — FIX: resolución de fechas relativas y confabulación de horario (mini-calendario en el prompt)

**Qué se hizo.** El bot resolvía mal los días relativos y llegó a confabular el horario. Evidencia real (conversación del viernes 10/07): cliente pidió "el lunes a las 11" (lunes 13) → el bot ofreció martes 14, afirmó "el lunes 14 estamos cerrados (abrimos de martes a viernes)" — doble confabulación (el lunes era el 13, y el horario del prompt dice L-V), y tras dos correcciones del cliente reservó el **miércoles 15**, el día equivocado. La causa: el mapeo palabra→fecha ("el lunes" → fecha) lo hacía el modelo antes de llamar a ninguna tool; el `diaSemana` que devuelven las tools solo corrige la etiqueta de un slot ya calculado, no la intención inicial.

**Decisiones clave.**
- **Mini-calendario en el prompt** (`buildUpcomingWeekCalendar` en availability.util, helper puro): 7 días consecutivos desde hoy con formato `día=fecha`, hoy marcado `(hoy)`, en zona del negocio. La ventana de 7 días garantiza **biyección día→fecha** (cada nombre de día aparece exactamente una vez, apuntando a su ocurrencia más próxima) — una ventana más larga reintroduciría la elección que queremos eliminar. El mapeo llega resuelto; el modelo ya no calcula fechas.
- Instrucción: usar SIEMPRE el calendario para convertir un día nombrado en fecha, nunca calcularlo; si el cliente corrige, re-mirar el calendario en vez de repetir.
- Refuerzo del horario (dentro de scheduleLine, solo si hay horario): "el horario indicado es la ÚNICA verdad sobre qué días abre o cierra; nunca afirmes que un día está cerrado si el horario dice lo contrario".
- `nowZoned` extraído como instante único en el engine: el calendario y el "Ahora es..." se calculan del mismo, para que no discrepen de día alrededor de medianoche.
- Fix de prompt puro + cálculo en el engine; las tools no cambian.

**Verificación.** lint/typecheck/build; 52/52 en los specs tocados (biyección asertada: 7 días sin repetidos; caso fin de año 29/12→4/1; zona coherente). En vivo (lunes 13): "cita el miércoles por la mañana" → resuelve al **miércoles 15** correcto, sin cabezotear (y respeta el hueco ocupado de las 11:00, ofreciendo alrededor); "¿cerráis el lunes?" → "no, abrimos L-V, el domingo es el único día que cerramos" (la confabulación del viernes, corregida).

**Commit.** `fix(api): resolución de fechas relativas y horario del bot (mini-calendario en el prompt)`

**Deuda descubierta (para el Camino A, inmediata).** `bot-tools.service.spec.ts` tiene 13 tests NO DETERMINISTAS que dependen del reloj real (fijan expectativas para 2026-07-13 pero usan la fecha actual en el cálculo → pasan o fallan según el día de ejecución). Confirmado con git stash que fallan en main sin este fix — no es regresión. Fix: inyectar fecha/now fija (mock) para que sean deterministas. Un test que depende del reloj no protege de nada.


### 2026-07-09 — H2 Tarea 9: Tomar control / devolver al bot + respuesta manual — H2 COMPLETO

**Qué se hizo.** El panel deja de ser mirador y se convierte en cabina de mando. Tres escrituras nuevas: `PATCH /conversations/:id/take-control` (→ HUMAN_CONTROL), `PATCH /conversations/:id/release` (→ BOT_ACTIVE) y `POST /conversations/:id/messages` (respuesta manual). Frontend: botón contextual en la cabecera del hilo + compositor de mensaje. **Cumple el criterio de lanzable de H2**: el bot atiende y el profesional puede ver qué dice, quitarle el micrófono, responder a mano y devolvérselo.

**Decisiones clave.**
- **Responder exige tener el control**: `POST /messages` con estado ≠ HUMAN_CONTROL → 409 ("Toma el control antes de escribir"). Si el profesional escribiera con el bot activo, ambos responderían y se pisarían. El botón de tomar control es también el interruptor que apaga al bot.
- **Enviar primero, persistir después.** Si Meta rechaza, NO queda Message en el hilo. Es el reverso de las confirmaciones fantasma del bot: allí el bot no podía afirmar lo que no había hecho; aquí la BD no puede mostrar un mensaje que el cliente nunca recibió. Test crítico con assert explícito: rechazo de Meta → 422 **y `persistOutgoing` no llamado** (cero Message).
- Tres códigos HTTP para tres causas: 409 (estado incorrecto/CLOSED), 422 (política de WhatsApp), 502 (fallo de envío). El frontend mapea cada uno a un texto útil.
- Sin optimistic update: el mensaje aparece cuando el backend confirma que Meta lo aceptó (coherencia con lo anterior). Spinner, no ilusión.
- `persistOutgoing` generalizado con `author?` (default BOT): los dos llamadores existentes (webhook, reminder processor) intactos. La generalización se anticipó en el asiento de T3.
- Auditoría solo en transición real (idempotente → 200 sin log, evita ruido). `conversation.manual_message` guarda solo `{length}`, nunca el cuerpo (puede llevar datos del cliente; el Message ya lo persiste).
- Documentado en el service: `status` tiene **dos escritores independientes** — el bot (`escalar_a_humano` → PENDING_REVIEW, en messaging) y el panel (transiciones, en conversations). Cada uno el suyo; no se coordinan.
- Módulo: `conversations/` importa `MessagingModule` (que pasa a exportar `WhatsAppAdapter` + `ConversationService`). Grafo acíclico: messaging no conoce conversations.

**Verificación en vivo.** (1) Tomar control → badge "Tú al mando" en cabecera y lista → mensaje escrito desde el panel **llega al móvil**, con burbuja y badge "tú" en el hilo. (2) Con HUMAN_CONTROL, escribo desde el móvil: el bot **calla**, el mensaje aparece en el panel, respondo yo. (3) Devolver al bot → vuelve a contestar. (4) El escalado del bot deja la conversación en "Requieren atención" con "Tomar control" destacado. (5) **La ventana de 24h no es verificable en sandbox**: Meta rechaza los envíos a números no verificados con `code=131030` ("Recipient phone number not in allowed list") antes de que la ventana entre en juego. El mapeo 131047 → 422 está cubierto por test unitario; se verificará en producción.

**Hallazgo y ajuste tras la verificación.** El error genérico del 502 ("Inténtalo de nuevo") era inútil ante un 131030 — reintentar no arregla que el número no esté en la lista del sandbox. Ahora Meta distingue dos rechazos de política, ambos 422 con textos propios: 131047 (ventana 24h → explica lo de las plantillas) y 131030 (sandbox → "añádelo en el panel de Meta, hasta 5 números de prueba"; el error que aparece a diario en desarrollo). El 502 dejó de prometer que reintentar arregla algo. Todos los códigos de Meta viven en el adapter (`isReengagementWindowClosed`, `isRecipientNotAllowed`). Los cuatro textos viven en el **backend** (donde hay cobertura de tests) y el frontend muestra `error.message`: menos duplicación, los cuatro casos verificados. Circuito completo comprobado en vivo: el backend loguea el detalle técnico (code=131030, HTTP 400), el frontend muestra el mensaje humano.

**Commit.** `feat(api,web): tomar control, devolver al bot y respuesta manual`

**Cierra H2 (WhatsApp Automático).** 9 tareas + 4 fixes transversales. El bot escucha, habla, reserva, cancela, reprograma, escala y recuerda — y el profesional lo ve todo y puede tomar el mando cuando quiera.

**Deuda nueva (menor).** `apps/web` no tiene runner de tests: todo el frontend se verifica a ojo. No urge en MVP, pero queda escrito.

**Deuda que bloquea el lanzamiento (no el desarrollo).** Entidad legal → verificación de negocio en Meta → salir del sandbox (hoy solo 5 números de prueba); plantilla HSM para recordatorios (el 131047 en producción); contrato de encargado del tratamiento + cifrado en reposo (RGPD); trust proxy.

### 2026-07-09 — Smoke test de compilación del grafo DI

**Qué se hizo.** `src/app.module.spec.ts`: un test que hace `Test.createTestingModule({imports:[AppModule]}).compile()`. Caza toda la familia de errores de wiring (guards, providers, exports que faltan) que los tests unitarios no pueden ver, porque instancian servicios a mano y nunca construyen el grafo DI.

**Motivación.** La T8 llegó al CHECK con 215 tests en verde y **la API sin arrancar** (`ConversationsModule` sin `imports: [AuthModule]`). Probado en ambos sentidos: sin el fix, `.compile()` rechaza con el error exacto; con el fix, pasa.

**Decisiones.** `try/finally` con `close()` garantizado, sin `--forceExit` (que escondería fugas de handles reales; el camino feliz cierra BullMQ/ioredis/Prisma limpio). Stub de env mantenido a mano a propósito, con `env.validation.ts` documentado como fuente de verdad: derivarlo automáticamente mataría el aviso cuando alguien añada una var obligatoria. `.compile()` no dispara `onModuleInit` → no toca Postgres.

**Commit.** `test(api): smoke test de compilación del grafo DI (AppModule)`

### 2026-07-09 — H2 Tarea 8: Panel de conversaciones (lista + hilo, solo lectura)

**Qué se hizo.** Primera tarea de la Oleada 2: el profesional ve por fin sus conversaciones de WhatsApp. Backend: módulo `conversations/` nuevo (lectura), separado de `messaging/` (escritura) — dos responsabilidades distintas. `GET /conversations` (lista paginada, filtro por estado, orden `lastMessageAt DESC nulls last`, preview del último mensaje) y `GET /conversations/:id/messages` (hilo, últimos 100 asc). Frontend: master-detail sobre el sidebar nuevo, con polling. **Solo lectura**: tomar control y responder es la T9.

**Decisiones clave.**
- **Metadata: whitelist, no blacklist.** Sanitizador puro que copia SOLO `reminder` y `escalation.motivo`; tokens, model, toolCalls, phantomGuard y appointmentId son inalcanzables por construcción — una fuga futura es imposible aunque el bot añada campos. Test con assert campo a campo (las claves resultantes son exactamente las esperadas).
- **Master-detail con layout anidado de Next** (lista en `conversaciones/layout.tsx`, hilo como `{children}`): la lista no se remonta al navegar entre conversaciones → sin flash, polling continuo, scroll y filtro preservados. Patrón idiomático, no un componente que se remonta.
- **Sin N+1**: `include` con `take: 1` resuelto por Prisma con `WHERE conversationId IN (...)`. Verificado con el log de queries contra Postgres real: **4 queries constantes** (conversations + client IN + count + messages IN), invariantes con 0 y con 3 filas. (Jest no podía: el engine de Prisma 7 usa dynamic import; se corrió contra el dist compilado con Node real.)
- Polling con TanStack Query (lista 30s, hilo 10s, `refetchOnWindowFocus`) en vez de websockets: infraestructura nueva innecesaria para un MVP donde el profesional mira puntualmente; migrable después sin tocar la UI.
- Gate multi-tenant en `:id` → 404 **con el mismo mensaje que "no existe"** (nunca 403 ni texto distinto) y sin llegar a leer mensajes. Lecturas no se auditan (coherente con H1).
- Badges por estado (verde BOT_ACTIVE / ámbar PENDING_REVIEW / azul HUMAN_CONTROL / gris CLOSED) + filtro "Requieren atención" — la vista que el profesional abrirá cada mañana. Burbujas con badge "🤖 bot" / "tú" (preparado para los HUMAN de T9) y marcadores de "recordatorio automático" y "escaló: {motivo}".

**Tropiezo instructivo.** El backend no arrancaba: `ConversationsModule` usaba `JwtAuthGuard` sin importar `AuthModule` (mismo caso que ClientsModule en H1, ya en el devlog). Los 215 tests pasaron con el arranque roto **porque todos son unitarios**: instancian servicios a mano con Prisma mockeado y nunca construyen el grafo DI. De ahí el smoke test transversal (commit aparte).

**Verificación.** lint/typecheck/build; 215 tests (+11: sanitizador y service). En vivo: las 3 conversaciones reales con preview/estado/hora relativa; hilo completo con burbujas IN/OUT, badge de bot, cabecera con estado y "Ver ficha"; marcadores de recordatorio (el que sonó solo) y de escalado (los dos NO_PUEDO_RESOLVER) presentes; cero telemetría a la vista; 404 con id de otro negocio. La captura del panel muestra, además, el fix del horario en acción ("a las 15:00 el negocio está cerrado, cerramos a las 14:00 y reabrimos a las 16:00").

**Commit.** `feat(api,web): panel de conversaciones (lista + hilo, solo lectura)`

**Deuda nueva (menor).** Hilo limitado a 100 mensajes sin cursor (paginar si aparecen hilos largos). El markdown de WhatsApp (`*negrita*`) se muestra crudo en las burbujas — parsear a `<strong>`. El enlace "Ver ficha" solo aparece con client vinculado (depende de la normalización H1↔E.164, deuda ya abierta) — el panel hace visible esa deuda, que es sano.

### 2026-07-09 — Frontend fase 3: Layout workspace (sidebar en desktop)

**Qué se hizo.** Tercera y última fase del plan de mejora del frontend (tokens ✅ → vista semanal ✅ → workspace). El marco de desktop pasa de topbar + tabs a un **sidebar de navegación colapsable**; móvil intacto (bottom-nav). Añadida la 5ª entrada "Conversaciones" con página placeholder. Prerequisito de la Oleada 2 de H2: el panel de conversaciones (T8) es un master-detail que pide espacio horizontal y encaja con un rail lateral.

**Decisiones clave.**
- Sidebar solo en desktop (≥md); en móvil el bottom-nav se mantiene (un sidebar en móvil es antipatrón). El "d-sidebar" del demo era la lista de clientes = contenido de pantalla, no navegación — descartado ya en su día.
- El sidebar es SOLO navegación: negocio arriba, 5 secciones, logout abajo. Ancho con labels (w-60), colapsable a rail de iconos (w-16) con `useState` en el layout — **sin browser storage** (restricción del proyecto); sobrevive a la navegación por estar montado en el grupo (app).
- `desktop-nav.tsx` **eliminado** (su función migra 1:1 al sidebar; no dejar código muerto). El sidebar hereda exactamente la misma frontera client que tenía desktop-nav: nada pasó de server a client (app-shell y las páginas siguen siendo server components).
- `NAV_ITEMS` sigue siendo fuente única; se le añade un campo opcional `shortLabel` para el bottom-nav móvil ("Chats"), porque "Conversaciones" (14 chars) se aprieta en 5 columnas de ~75px. En el sidebar desktop va el label completo.
- La 5ª entrada entra YA apuntando a `/conversaciones` con placeholder "Próximamente" (patrón de Caja): así la T8 solo rellena la página, sin volver a tocar navegación.
- Alcance estricto: **cero cambios en las 4 pantallas** (verificado por `git status`, ni una línea de sus archivos). Su contenido conserva el ancho (`max-w-2xl`); solo cambia su posición relativa dentro del main.

**Verificación.** lint/typecheck/build limpios (`/conversaciones` en el árbol de rutas). Grep: 0 referencias a localStorage/sessionStorage. Visual (verificada por mí en navegador): 5 entradas navegando y marcando activa, colapsar/expandir, las 4 pantallas íntegras, placeholder de Conversaciones, y bottom-nav móvil con los 5 items sin apretarse.

**Archivos.** Nuevos: `sidebar.tsx`, `(app)/conversaciones/page.tsx`. Modificados: `nav-items.ts` (+item, +shortLabel opcional), `bottom-nav.tsx` (1 línea), `app-shell.tsx` (flex-col md:flex-row + Sidebar). Eliminado: `desktop-nav.tsx`.

**Commit.** `feat(web): layout workspace con sidebar en desktop + entrada de Conversaciones`

**Deuda nueva (menor).** Marca reducida en el rail colapsado: hoy una "o" verde (el wordmark no cabe a 64px) — sustituir por isotipo cuando exista. El estado colapsado no persiste entre sesiones (por la restricción de storage); si se quiere persistente, cookie o preferencia de usuario en backend.

**Cierra.** Plan de mejora del frontend completo (design tokens → vista semanal → workspace). Siguiente: H2 Oleada 2 (T8 panel de conversaciones, T9 tomar control).

### 2026-07-08 — FIXES transversales: el reloj y el horario del bot

Dos fixes de la misma familia (el bot y el tiempo), detectados en la verificación en vivo de T7 y commiteados por separado sobre ella.

**FIX 1 — El bot conoce la hora, no solo el día** (`fix(api): el bot conoce la hora actual...`, 95fd0f8)
- **Síntoma**: a las 23:34 (servidor correcto: now() = 21:34 UTC = 23:34 CEST) el bot dijo "son casi las 19:30" y llamó a crear_cita con `2026-07-08T19:30` — la hora de las pruebas de aquella tarde, **alucinada desde el historial**. Causa: el Fix T5-1 inyectaba la FECHA pero no la HORA; sin dato fresco, el modelo lo saca del contexto viejo (primo del bug de caducidad de T5).
- **Fix**: el prompt recibe "Ahora es {díaSemana}, {fecha} a las {HH:mm}" en zona negocio + instrucción de usar SIEMPRE esa hora para juzgar "ya pasó"/"cuánto falta" y NUNCA deducirla del historial. Campo `today` → `now` (un campo llamado today con una hora dentro miente al lector). Defensa en profundidad: crear_cita rechaza fechaHora pasada del mismo día con error localizado y accionable ANTES de resolver cliente/entrar en transacción (el `assertNotPast` de H1 queda de backstop: su mensaje es genérico y en inglés, no accionable por el modelo).
- **Verificado en vivo**: "quiero una cita en 10 minutos" a las 23:52 → "son las 23:52 de hoy miércoles..." ✅

**FIX 2 — El bot respeta y comunica el horario** (`fix(api): el bot respeta y comunica el horario del negocio`, 0a2ece6)
- **Síntoma/hueco**: `crear_cita` no validaba contra `weeklySchedule` — solo heredaba las validaciones de H1 (solape, no-pasado), que desconocen el horario (lo añadimos en T5 solo para la tool de disponibilidad). El flujo normal lo tapa (el cliente elige un slot propuesto), pero un modelo confundido puede ir directo a crear (evidencia: el 19:30 de las 23:34). Además el bot **no sabía el horario**: decía "no tengo hueco a las 15:00" (infiriendo de la ausencia en la lista de slots) cuando lo correcto es "a esa hora estamos cerrados".
- **Fix**: (a) guard en crear_cita que valida que la cita **cabe completa** en un intervalo abierto — no solo que el inicio caiga dentro (caso clave: Consulta de 30' a las 13:45 con cierre a las 14:00 → rechazada). `intervalBounds` extraído y **compartido con `computeFreeSlots`**: el guard no puede divergir de los slots ni ser más laxo. (b) `formatScheduleSummary` inyecta el horario legible en el prompt ("lunes a viernes: 9:00-14:00 y 16:00-20:00; sábado: 9:00-14:00; domingo: cerrado") para que el bot diga "los domingos cerramos" sin gastar una tool y sin depender de su sentido común. Sin weeklySchedule → no bloquea y omite la línea (no inventar).
- Bordes: servicio inexistente/inactivo → se omite el guard y `create()` da el error canónico (no duplicar mensajes).

**Verificación.** lint/typecheck/build; 185 → 204 tests. Verificación en vivo del guard de horario pendiente (requiere toques de WhatsApp): probar cita en domingo, a las 22:00, y a las 13:45 con cierre a las 14:00.

**Nota operativa.** El guard usa el `weeklySchedule` del negocio en BD (sembrado por psql en T5). Si rechaza una hora que parece válida, lo primero a comprobar es que el horario en BD coincida con el esperado.

**Moraleja (afinada, tercera vez).** La verificación en vivo debe cubrir los ejes que un fix anterior parecía cerrar: el bug del reloj escapó a T5 porque allí probamos fechas ("mañana", "el jueves") pero no horas ("en 10 min", "¿ya pasó?"); y el hueco del horario solo apareció al preguntarse, como dueño del negocio y no como programador, "pero si a esa hora está cerrado, ¿no?".

### 2026-07-08 — H2 Tarea 7: Recordatorios de cita 24h antes (BullMQ + Redis)

**Qué se hizo.** Cierre de la Oleada 1: la dimensión temporal. El bot recuerda la cita al cliente 24h antes por la misma conversación de WhatsApp, y el Redis del docker-compose entra en servicio por primera vez. Cola BullMQ `appointment-reminders`, un job por cita con **jobId determinista = appointmentId** (la clave para cancelarlo/reprogramarlo desde cualquier origen), programado con `delay` hasta (startsAt − 24h). La respuesta del cliente al recordatorio la gestionan T5/T6 gratis por el flujo normal del webhook: aquí solo sale el OUT programado.

**Decisiones clave (PLAN).**
- **Módulo híbrido para grafo acíclico.** `reminders/` tiene la cola + el scheduler (sin dependencias de otros módulos de feature); el **processor vive en `messaging/`** porque componer y enviar un WhatsApp ES mensajería (necesita adapter + ConversationService). Si el processor viviera en reminders habría ciclo `Messaging → Appointments → Reminders → Messaging`. Grafo final: Reminders → nada; Appointments → Reminders; Messaging → Appointments + Reminders.
- **Best-effort innegociable: Redis caído ≠ citas rotas.** `RemindersService.schedule/cancel/reschedule` JAMÁS lanzan (try/catch interno + log ERROR, patrón de `transitionToPendingReview` de T6). Conexión con `enableOfflineQueue:false` (el producer falla al instante en vez de colgar el `await` que bloquearía la cita) + `maxRetriesPerRequest:null` (requisito del Worker) + `retryStrategy` con backoff hasta 30s (sin él, un Redis caído inunda el log: medido ~20 líneas/s → una cada 30s).
- **Ganchos en los services de H1** (create/cancel/update), no en el bot: un solo punto cubre TODOS los orígenes (web, bot T5, reprogramación T6 = cancel+create). `update` solo reprograma si la fecha cambia de verdad (comparación `getTime()`; un PATCH de solo-notas o con la misma hora no toca la cola).
- **El processor releé la cita** (el job puede tener 6 días): descarta jobs huérfanos (inexistente / no activa / startsAt cambiado respecto al del payload / ya pasada), respeta conversaciones intervenidas (HUMAN_CONTROL/PENDING_REVIEW → no envía, el equipo está al mando), y para el **cliente de la web que nunca escribió crea la conversación** (BOT_ACTIVE, mismo patrón que persistIncoming: buscar no-CLOSED antes de crear). 131047 (ventana cerrada) = completado-con-fallo con WARN (reintentar no la abre); otros errores → política de reintentos de BullMQ (3, backoff).
- **Flags estrictos** `REMINDERS_ENABLED` (`=== 'true'`, default off; el processor lo comprueba también, por si quedan jobs de antes) y `REMINDERS_LEAD_MINUTES` (override de la antelación SOLO para prueba manual, con WARN). `REDIS_URL` a env requeridas (fail-fast); el servidor caído no bloquea el arranque.

**CHECK.** lint + typecheck + build en verde; 183 tests (150→183, +33). Cubiertos: los 4 descartes del processor + 131047 + camino feliz (con/sin conversación previa) + "a nombre de"; scheduler (jobId/delay, no-programar-si-lead-pasó, flag estricto, Redis caído no lanza, override de lead) + **flujo T6 a nivel de jobs con cola fake CON ESTADO** (tras cancel+create queda exactamente 1 job, el de la cita nueva) + update con startsAt igual NO reprograma. Humo con Redis real: arranque limpio; job huérfano encolado a mano → el processor lo consumió y descartó con su log; rastro limpiado de Redis. Sin Redis: la app arranca igual.

**Nota de implementación.** El texto del recordatorio dice "de mañana" solo si la cita ES mañana en el timezone del negocio; si el job dispara tarde (Redis caído horas) o con lead de prueba, dice "de hoy"/"del jueves" — la referencia temporal no miente, la fecha y hora explícitas van siempre. `THIRD_PARTY_NOTE_RE` exportada de bot-tools (el "a nombre de" del recordatorio reutiliza el mismo parser, sin duplicar). `msgpackr-extract` (transitiva de BullMQ, acelerador nativo opcional) a `allowBuilds:false` en pnpm-workspace — BullMQ va en JS puro sin él.

**Commit.** `feat(api): recordatorios de cita 24h antes (BullMQ + Redis)`

**Deuda nueva.** Plantilla HSM aprobada para el 131047 (DESTACADA pre-lanzamiento): en v1 el recordatorio es texto libre y muere si la ventana de 24h está cerrada — justo el caso típico de un recordatorio a alguien que no ha escrito hoy. Antelación fija en 24h (constante con comentario "futuro BotConfig"). El recordatorio a clientes de la web depende de la normalización H1↔E.164 (deuda ya abierta): si el teléfono se guardó en local, no casa con la conversación y el envío falla contra Meta.

**Verificación en vivo (pendiente, la hace Javier).** `REMINDERS_ENABLED=true` + `REMINDERS_LEAD_MINUTES=5` → cita a +10 min → recordatorio al móvil a los ~5; responder "cancélala" (T6); ver aparecer/desaparecer el job en `redis-cli keys` al crear/cancelar; parar Redis y crear cita (se crea igual, ERROR en log). **[CERRADA el 14/07/26 — ver asiento de esa fecha.]**

### 2026-07-08 — H2 Tarea 6: Escalado real + cancelar/reprogramar

**Qué se hizo.** El ciclo conversacional completo: (a) el escalado dejó de ser verbal — `escalar_a_humano` (enum de 5 motivos del 09, auditado en metadata) ejecuta la transición real a PENDING_REVIEW, la única escritura de status desde el bot; el guard de T3 hace el resto (el bot calla de verdad). (b) `listar_mis_citas` + `cancelar_cita` con **identidad por teléfono innegociable** (solo citas de los Clients del phone de la conversación; error único byte-a-byte para ajena/pasada/inactiva/otro-negocio — ni el texto filtra). (c) Reprogramar como flujo compuesto en prompt (crear-antes-de-cancelar: si algo falla, el cliente queda CON cita). Reutilización directa de cancel() de H1 (auditoría: ya invocable, soft, sin refactor). Guardia anti-fantasma generalizada a 3 pretensiones (reserva/cancelación/escalado) con filtro de interrogativas. **Opción A**: los fallbacks que prometen equipo escalan de verdad — el fallback disparándose ES el momento de atención humana.

**Los 4 fixes de la verificación en vivo** (141→152 tests):
1. **Escalado silencioso** — tool ok + Claude devolvió texto vacío → el "empty→silencio" de T4 se tragó la despedida: cliente escalado sin saberlo (intermitente). Fix: `replyForSilence()` — tras tool CON EFECTO ok, texto fijo compuesto de los tool_results reales; generalizado a las 3 rutas de silencio (vacío/refusal/fallo de SDK a mitad de bucle). Acción con efecto JAMÁS acaba en silencio.
2. **El ordinal como id** — el modelo envió `appointmentId: "4"` (el número del listado, no el UUID). Fix: instrucción en prompt + aviso EN el tool_result de listar (el punto de uso). Referencia corta re-mapeada: rechazada con justificación (exigiría estado por conversación en un engine stateless — complejidad sin necesidad probada; deuda si reincide).
3. **Input malformado → stack de Prisma** — el "4" llegó a findFirst (P2023) → error opaco → escalado evitable. Fix: validación de shape pre-query en TODOS los inputs de tools (audit completo) → errores de negocio legibles con autocorrección guiada ("vuelve a llamar a listar_mis_citas"). Ningún input del modelo puede producir un stack.
4. **Fallo parcial deshonesto** — crear ok + cancelar fallido dejó DOS citas y el bot despidió con el genérico, sin avisar del duplicado. Fix determinista: esa combinación de toolCalls produce el texto honesto fijo ("he creado la nueva pero no pude anular la anterior — te han quedado las dos; aviso al equipo").

**Verificación final (los 4 escenarios).** Escalado → PENDING_REVIEW en BD + silencio total posterior (INs persistidos) ✅. Listar → las 5 citas exactas con "a nombre de Lucía" ✅. Cancelar → UUID correcto en el log, CANCELLED en BD ✅. Reprogramar → nueva CONFIRMED + vieja CANCELLED, sin duplicados pese a un doble-"sí" del cliente (la protección de solape absorbió el riesgo) ✅.

**Commit.** `feat(api): escalado real + cancelar/reprogramar por el bot`

**Refinamiento acumulado para BotConfig/v2 (no bugs).** Aritmética de calendario del modelo floja en el razonamiento PRE-consulta ("el martes ya pasó" → ofrece "martes 15"; el diaSemana de la tool corrige al consultar, pero la resolución de fechas relativas es previa) — candidata: mini-calendario de 7 días en el prompt, no solo el "hoy". Doble petición de confirmación en cancelaciones dentro de reprogramación. La despedida del escalado a veces del modelo, a veces fija — homogeneizar tono cuando haya BotConfig.

**Moraleja (refuerzo de T5).** 152 tests y los 4 hallazgos solo en vivo — y tres de los cuatro de la misma familia: *el modelo hace lo natural, no lo instruido* (usa el número visible, calla al terminar, no redacta el aviso incómodo). La respuesta es siempre la misma: determinismo en el backend para todo lo que importa.


### 2026-07-07 — H2 Tarea 5: Acciones de agenda del bot (disponibilidad real + creación con confirmación)

**Qué se hizo.** El bot pasa de hablar a actuar: dos tools server-side (`consultar_disponibilidad`, `crear_cita`) vía tool use nativo de Anthropic, implementando el flujo de reserva del 09 con confirmación explícita obligatoria. Un cliente reserva conversando por WhatsApp y la cita aparece en la Agenda web del negocio — **el círculo completo del producto, verificado en vivo** (5 citas reales creadas por el bot, contrastadas en psql y Agenda).

**Decisiones clave (PLAN).**
- `weeklySchedule Json?` en Business (migración aditiva): intervalos por día → soporta jornada partida española; null = sin horario (la tool lo dice, jamás inventa). Seed por psql documentado (§9).
- Hallazgo de auditoría: H1 YA protege solapes en transacción (ConflictException en AppointmentsService.create) → reutilizándolo, la protección de carrera vino gratis y cero lógica duplicada. Refactor mínimo H1 (4 cambios): createdById nullable, param source (bot → WHATSAPP; la agenda distingue origen), exports de módulos, ACTIVE_STATUSES compartido. De rebote: primera suite de tests de regresión de appointments (no existía).
- SDK @anthropic-ai/sdk adoptado (bucle multi-turno tipado + retries — cierra parte de la deuda T4); bucle manual con tope 5 iteraciones + fallback honesto. Adapter de Meta sigue con fetch.
- Slots en rejilla fija de 30 min (horas naturales), máx. 8 + masHuecos, formato exacto para que el modelo copie. Lógica pura en availability.util (testeable sin BD). Metadata por OUT: tokens acumulados + toolCalls.

**Los 4 fixes de la verificación en vivo** (100→102 tests; ninguno lo habría cazado un test a priori):
1. **El bot no sabía qué día es** — preguntó la fecha al cliente y compuso año pasado → el filtro de slots pasados vació la disponibilidad ("no hay huecos" falso). Fix: fecha actual (día de semana + año, zona negocio) inyectada en el prompt + la tool rechaza fechas pasadas con error explícito + log DEBUG de tools (nombre + input).
2. **Reciclaje de disponibilidad caducada** — afirmó "no hay huecos el 8" sin llamar a la tool, reutilizando un resultado obsoleto del historial. Fix: regla de caducidad en el prompt ("nunca afirmes disponibilidad sin tool_result de este turno") + diaSemana devuelto por la tool (también llamó "miércoles" al jueves 9).
3. **CONFIRMACIONES FANTASMA (crítico)** — 2 de 4 reservas "¡Listo! confirmada" no existían en BD: el modelo imitaba el patrón de confirmación del historial saltándose crear_cita, violando la prohibición explícita del prompt. Fix: **guardia determinista en el engine** — detector puro por participios perfectivos ("queda confirmada/he reservado" dispara; la recap "Te confirmo: …, ¿correcto?" no) + señal 100% cierta de toolCalls; 1 corrección inyectada máx., luego fallback honesto; texto fantasma jamás se envía; `phantomGuard: corrected|suppressed` en metadata. **Validación inmediata: en las 2 reservas siguientes la guardia saltó ('corrected') — el modelo reincidió 2 veces más y la defensa salvó ambas.** Lección de diseño: la conducta crítica no puede depender solo del prompt.
4. **Nombre de terceros perdido** — todas las citas cuelgan del Client resuelto por teléfono (diseño correcto), pero los nombres dados (Fátima, Ester, Iván) se perdían — y la tool confirmaba "a nombre de javier" citas de otros. Fix: si el nombre dado difiere (laxo) → notes "Reserva a nombre de: X (vía WhatsApp)" + la confirmación usa el nombre dado. Verificado (cita de Lucía con nota).

**Verificación final.** 5/5 citas del bot en BD (source WHATSAPP, createdById null); Agenda web mostrándolas (captura); hueco ocupado → rechaza las 12:00 y ofrece las 12:30 (aritmética de intervalos exacta); domingo → no inventa; reservas encadenadas multi-persona en una conversación contaminada, todas respaldadas.

**Commit.** `feat(api): acciones de agenda del bot (disponibilidad real + creación con confirmación)`

**Deuda nueva.** Reservas para terceros de verdad (múltiples personas por teléfono; hoy: 1 Client + nota como paliativo) — decisión de producto. Refinamiento de prompt acumulado para BotConfig: parafraseo impreciso del "cerrado" (dice "no tengo información"), aritmética de calendario floja (lío viernes/sábado autocorregido por la tool), repetición de coletillas. Observabilidad: log del webhook no registra mensajes de texto procesados (solo statuses) — añadir DEBUG simétrico. Bajar "Ignoring status" a VERBOSE (ruido).

**Moraleja (para el proyecto).** 100 tests en verde y el fallo más grave del producto solo apareció conversando de verdad. La verificación en vivo conversacional es parte del CHECK desde ahora, con regla: ninguna confirmación del bot se da por buena sin su fila en psql.

### 2026-07-07 — H2 Tarea 5: acciones de agenda del bot (el círculo completo del producto)

**Qué se hizo.** El bot pasa de hablar a actuar: `consultar_disponibilidad` (horario semanal −
citas activas → slots de 30 min en timezone del negocio, máx. 8 al modelo) y `crear_cita`
(solo tras confirmación explícita; resuelve cliente vinculado → por teléfono → creación mínima,
y reutiliza `AppointmentsService.create` de H1). Tool use nativo de Anthropic con bucle manual
(tope 5 → fallback) sobre el SDK oficial. Verificado en vivo: reserva completa por WhatsApp
visible en la Agenda web.

**Auditoría previa (resultados).** Horario: NO existía → `weeklySchedule Json?` en Business
(migración aditiva; jornada partida con intervalos por día; seed por psql, §9 del setup).
Solapes: H1 SÍ protegía (`assertNoOverlap` en transacción) → protección de carrera gratis
reutilizando `create`. Cliente desconocido: flujo viable con `ClientsService` sin refactor.
Hallazgo extra: `create()` exigía userId → refactor mínimo retrocompatible
(`createdById: string | null` + `source` con default MANUAL + exports de módulos +
`ACTIVE_STATUSES` compartida). Cambios H1: solo esos 4, aprobados.

**Decisiones clave.**
- SDK `@anthropic-ai/sdk` adoptado (revirtiendo el fetch de T4, como estaba previsto): el bucle
  multiplica llamadas por mensaje y los retries automáticos 429/5xx compensan. Bucle MANUAL, no
  el tool runner beta (tope de iteraciones y control fino). El adapter de Meta sigue con fetch.
- Rejilla fija de 30 min (horas naturales para WhatsApp) frente a paso=duración.
- Tools SIEMPRE server-side con businessId de la conversación; el modelo solo ve serviceIds.
- Metadata del OUT: tokens acumulados del bucle + `toolCalls: [{name, ok}]` + `phantomGuard`.

**Los 4 fixes de la verificación en vivo (los bugs reales de un bot que actúa).**
1. **El modelo no tiene reloj**: preguntó la fecha al cliente y construyó año pasado → fecha
   actual (día de semana + año, zona negocio) inyectada en el prompt + guarda de fecha pasada
   en la tool ("esa fecha ya pasó" en vez de lista vacía engañosa).
2. **Recicló disponibilidad obsoleta del historial** ("no hay huecos" sin tool en el turno) →
   regla de caducidad en el prompt + `diaSemana` lo calcula la tool (llamó "miércoles" al jueves).
3. **Confirmaciones fantasma (crítico)**: 2 de 4 "citas confirmadas" no existían en BD →
   guardia determinista en el engine: texto que pretende confirmar (heurística de participios;
   la recapitulación legítima no dispara) sin `crear_cita ok` en el turno → 1 corrección
   inyectada (interna del bucle, no se persiste) o supresión + fallback honesto + log ERROR.
4. **Nombre de terceros perdido** (Fátima/Ester/Iván → todo "javier") → nota en la cita
   "Reserva a nombre de: X (vía WhatsApp)" si difiere del Client (comparación laxa).
   Patrón general aprendido: 1-3 son la misma familia — el modelo imita el historial en vez de
   consultar; la defensa robusta es determinista en backend, el prompt solo primera línea.

**Verificación.** lint/typecheck/build/prisma:validate + 102/102 tests (9 suites). En vivo
(Javier): reserva completa → cita en la Agenda web; doble reserva → re-ofrece sin crear;
domingo → cerrado; nombres de terceros en notas; metadata con tokens y toolCalls por psql.
El log DEBUG de tools (añadido en fix 1) fue la herramienta de diagnóstico de los fixes 2 y 3.

**Commit.** `feat(api): acciones de agenda del bot (disponibilidad real + creación con confirmación)`

**Deuda nueva.** Reservas para terceros (producto); horario sin UI (psql); evolución de la
heurística anti-fantasma a marcador estructural si resulta ruidosa. Cerrada parcialmente la de
T4: retries de Claude resueltos por el SDK (queda el mensaje de cortesía ante fallo total).

### 2026-07-07 — H2 Tarea 4: BotEngine v0 con Claude Haiku (el bot conversa)

**Qué se hizo.** Sustituido el eco de T3 por el primer bot real: Claude Haiku respondiendo con datos reales del negocio. `bot-prompt.builder.ts` (función pura: identidad + servicios reales con precio/duración + timezone + reglas del 09) y `bot-engine.service.ts` (lee Business/Services/historial de BD — todo filtrado por businessId —, llama a /v1/messages con fetch nativo, devuelve texto + metadata de tokens o null ante fallo). El eco y su flag, extinguidos del código (grep = 0; el asiento histórico de T3 en devlog se conserva como memoria).

**Decisiones clave.**
- Alcance v0 (opción A, sin BotConfig): prompt construido solo con lo existente (Business + Services). La configurabilidad llega cuando el uso real diga qué merece configurarse. Solo conversación informativa: el bot habla, no actúa (acciones de agenda = T5; transiciones de estado = T6; en v0 el escalado es verbal — dice "aviso al equipo" pero el estado no cambia).
- Cumplimiento de serie: identificación proactiva como IA en el primer mensaje de cada conversación (Art. 50, deadline 2026-08-02) — detectada por ausencia de OUT previo del BOT; uso auxiliar Meta implementado como regla de redirección en el prompt.
- Regla dura de no-citas en v0: ante petición de cita, toma nota + "el equipo confirma", sin inventar disponibilidad. Verificado en vivo: la cumplió e incluso pidió el nombre para la reserva.
- fetch nativo (sin SDK: una llamada, coherencia con el adapter, sin retries por diseño — fallo → log + silencio, mejor que error raro al cliente). claude-haiku-4-5, max_tokens 500, temperature 0.3, timeout 30s.
- Historial: últimos 10 mensajes como turnos user/assistant; el IN actual va como último turno, excluido del historial (evita duplicado). Services vacíos → el prompt lo declara y prohíbe inventar.
- `BOT_ENGINE_ENABLED === 'true'` estricto (mismo patrón que el eco); `ANTHROPIC_API_KEY` obligatoria fail-fast.
- Metadata de coste en cada OUT: `{model, inputTokens, outputTokens}` — medición desde el mensaje uno.

**Verificación en vivo (guion de 5 pruebas + estados).** Identificación IA en el saludo ✅. Servicios: SOLO los de BD (Consulta 20€/30min), cero inventos ✅. Fuera de scope (fútbol) → redirección a temas del negocio ✅. Cita → toma nota sin inventar huecos ✅. Lo que no sabe (parking) → "aviso al equipo" ✅. Estados: HUMAN_CONTROL → silencio / BOT_ACTIVE → responde ✅. Metadata en todos los OUT. Coste de la primera conversación completa (4 respuestas): ~3.740 in + ~218 out ≈ menos de medio céntimo — a este coste, ~20 conversaciones/día ≈ 2-3€/mes por negocio.
Bonus no buscado: por un despiste (la conversación de T3 no llegó a cerrarse), el bot conversó con ecos en el historial sin imitarlos ni confundirse — robustez verificada de rebote. La recomendación de empezar limpio sigue en el doc.

**Commit.** `feat(api): BotEngine v0 con Claude Haiku (conversación informativa)`

**Deuda nueva (menor, para BotConfig/refinamiento futuro).** El bot repite la coletilla "el equipo te confirmará en breve" en mensajes consecutivos — pulir con instrucción anti-repetición cuando haya BotConfig. Env de Anthropic: puesto límite de gasto en consola como salvaguarda.


### 2026-07-07 — H2 Tarea 4: BotEngine v0 con Claude Haiku (el bot habla, no actúa)

**Qué se hizo.** El primer bot de verdad sustituye al eco de T3: `BotEngineService` genera la
respuesta con `claude-haiku-4-5` a partir de datos reales de BD (Business + Services activos +
últimos 10 mensajes), y `buildBotSystemPrompt` (builder puro, testeable sin Nest/Prisma) monta el
system prompt dinámico: identidad + nunca-decir-que-es-humano, servicios con precio/duración,
timezone, regla dura de no-citas ("tomo nota, el equipo confirma" — cero acciones de agenda, cero
transiciones de estado), redirección de temas ajenos (política Meta), sin datos clínicos, e
identificación proactiva como IA (Art. 50) solo en la primera respuesta de cada conversación.
Cada OUT del bot persiste metadata `{inputTokens, outputTokens, model}` (Json) — coste medido
desde el día 1. Eco y `MESSAGING_ECHO_ENABLED` eliminados por completo (queda solo la mención
histórica en el asiento de T3 de este devlog).

**Decisiones clave.**
- fetch nativo contra `/v1/messages` (coherencia con el adapter; sin retries POR DISEÑO en v0;
  el SDK oficial se reevalúa en T5 cuando llegue tool use). Timeout 30s con AbortSignal,
  max_tokens 500, temperature 0.3, HISTORY_LIMIT 10 — constantes en el service.
- El BotEngine solo LEE de BD y genera texto; la orquestación (generar → enviar → persistir) vive
  en webhook.service (patrón de separación de T3). Cualquier fallo de Claude (red, 429, 5xx,
  respuesta vacía, refusal) → log claro + `null` → silencio; mejor silencio que error raro, y la
  recepción jamás se rompe.
- Multi-tenancy: las 4 queries del engine (business, services, OUT previo, historial) filtradas
  por businessId, con test dedicado que inspecciona los `where` reales; el builder es puro y solo
  recibe el negocio ya resuelto — el prompt no puede contener datos de otro negocio.
- Identificación IA: `findFirst` de OUT/BOT aparte del historial (un OUT previo puede quedar
  fuera de la ventana de 10). Historial mapeado IN→user / OUT→assistant, descartando turnos
  assistant iniciales (la API exige empezar por user).
- Services vacíos: el prompt lo declara explícitamente y prohíbe inventar (el bot sigue útil
  para tomar nota) — decisión aprobada en el plan.
- Ecos de T3 en el historial: NO se filtran por contenido (frágil); en pruebas se cierra la
  conversación vieja (CLOSED) y se empieza limpia — documentado en §8 del doc de setup.
- Flag `BOT_ENGINE_ENABLED === 'true'` estricto (mismo patrón e it.each que el eco);
  `ANTHROPIC_API_KEY` obligatoria fail-fast, mismas reglas de secreto que el access token.

**Verificación.** lint/typecheck/build + 45/45 tests (6 suites): builder (services reales,
vacíos, identificación condicional, no-citas), engine con fetch/Prisma mockeados y orquestación
del webhook (estados, dedupe, fallos no propagados). Verificación en vivo (Javier) según el §8
reescrito del doc de setup, previa a pedir el commit.

**Commit.** `feat(api): BotEngine v0 con Claude Haiku (conversación informativa)`

**Deuda nueva.** Fallo de Claude = silencio (sin retries ni cortesía); contextSummary sin
implementar (ventana fija de 10); prompt caching diferido. Ver sección IA / Bot (H2).

### 2026-07-06 — H2 Tarea 3: WhatsAppAdapter de envío + eco de prueba (Onpilot responde por primera vez)

**Qué se hizo.** La mitad saliente de la tubería: `WhatsAppAdapter` (única pieza que habla con la Graph API para enviar; interfaz `sendText(to, body) → {waMessageId}`, intercambiable por diseño multicanal), `persistOutgoing` en ConversationService (Message OUT/BOT + lastMessageAt), y eco temporal activable por flag que responde un texto fijo a cada IN. Sin bot: el eco es fontanería, marcado `// ECO TEMPORAL (Tarea 3)` para sustitución directa por el BotEngine en T4.

**Decisiones clave.**
- fetch nativo de Node 24 (sin dependencia HTTP nueva) + `AbortSignal.timeout(10s)`. Errores de Meta mapeados a `WhatsAppSendError` (code/subcode); caso 131047 (ventana 24h cerrada) con log específico — manejo con plantillas diferido.
- El adapter no conoce Prisma/negocio; la orquestación vive en webhook/conversation service. `author: BOT` hardcodeado en persistOutgoing (generalización a HUMAN en T6).
- Retorno de `persistIncoming` ampliado a `{persisted, conversationId, conversationStatus}` (desviación aprobada: el eco necesita el estado sin query extra fuera de transacción).
- Eco solo si `MESSAGING_ECHO_ENABLED === 'true'` estricto (it.each: 'TRUE', '1', 'false', 'true ', ausente → NO eco) Y conversación en `BOT_ACTIVE` — el patrón "el sistema calla fuera de BOT_ACTIVE" establecido desde el primer envío. Fallo de envío no rompe la recepción (try/catch propio; el IN persiste igual).
- Al responder se usa el `from` crudo de Meta (formato que Meta espera); el E.164 normalizado es solo para BD.
- Token permanente vía System User (Onpilot-backend, acceso Employee, activos: app + WABA, scopes messaging+management, sin caducidad) — documentado en §7 del setup; sustituye a los temporales de 24h.
- Desviación menor aprobada: moduleNameMapper en config de jest (imports ESM .js del cliente Prisma; primera suite que lo carga). Solo tests.

**Verificación.** lint/typecheck/build + 24/24 tests (4 suites). En vivo: eco recibido en el móvil (par IN/OUT en BD, el OUT con author=BOT y wamid real de Meta). Prueba de estados: conversación a HUMAN_CONTROL por psql → mensaje → silencio (el IN sí persiste) → BOT_ACTIVE → el eco vuelve. Tropiezo instructivo: el primer intento de la prueba actualizó la conversación fantasma de los curls de T2 (+34600000000) en vez de la real — el UPDATE de la prueba de estados debe apuntar por id explícito, no por status.

**Commit.** `feat(api): WhatsAppAdapter de envío + eco de prueba tras recepción`

**Higiene de secretos (sesión).** App Secret restablecido (el anterior salió en captura). Pendiente inmediato: rotar verify token y regenerar el token temporal del panel de ayer. Regla reforzada: cerrar la pestaña del .env antes de capturar pantalla.

**Deuda nueva (menor).** Doc §8: añadir "listar conversaciones y apuntar el UPDATE por id" (evitar el tropiezo de la conversación fantasma). Conversación de prueba +34600000000 en BD — cerrarla (CLOSED) o dejarla como historial de test.

### 2026-07-05 — H2 Tarea 2: Webhook de recepción de WhatsApp (verificado con mensaje real)

**Qué se hizo.** Módulo `messaging` en apps/api: recepción completa Meta→BD. `WebhookController` (GET challenge + POST con firma sobre rawBody, 200 rápido, sin JwtAuthGuard — protegido por HMAC), `WebhookService` (verificación de firma delegada en util pura, parseo Cloud API, resolución de negocio por env), `ConversationService` (persistencia en $transaction: find-or-create de conversación abierta + Message IN + lastMessageAt + dedupe P2002). Sin bot, sin envío — solo recepción. Doc de setup: `docs/features/h2-webhook-setup.md`.

**Decisiones clave.**
- Firma HMAC-SHA256 sobre rawBody (`rawBody: true` en bootstrap, aditivo) con `timingSafeEqual` + guard de longitud; extraída a `signature.util.ts` (función pura, testeable sin Prisma/Nest — desviación del plan anunciada y aprobada: mejora de diseño).
- 200 rápido e incondicional tras validar firma; errores de procesamiento → log + 200 (evitar tormenta de reintentos de Meta). Procesamiento síncrono aceptado en sandbox; service separado como línea de corte para encolar (Bull) en T7 sin tocar el controller.
- Resolución de negocio: `metadata.phone_number_id` vs env (`WHATSAPP_PHONE_NUMBER_ID` → `WHATSAPP_BUSINESS_ID`); no coincide → warning + 200 sin persistir. Mecanismo v1-sandbox, la resolución multi-tenant real llega con registro de números por negocio.
- Solo `type: text`; statuses y otros tipos → log e ignorar. 4 env vars WhatsApp obligatorias (fail-fast en env.validation.ts).
- Vinculación con Client: lookup por teléfono; si el formato no casa → clientId null (seguro).

**Verificación.** lint/typecheck/build/test 7/7 (HMAC con casos de header ausente/malformado). Curls locales §4: challenge OK/KO (200 challenge / 403), POST firmado → persiste, repetido → dedupe (count estable, P2002 capturado), firma inválida → 401, statuses → 200 sin persistir. **En vivo:** ngrok + callback URL + verify token en Meta → challenge verificado (GET 200 en túnel). Hallazgo: la app NO quedaba suscrita a la WABA con el toggle del panel — resuelto vía Graph API (`POST /{waba-id}/subscribed_apps` → success:true; antes solo estaba suscrita la app interna de Meta "WA DevX"). Tras suscribir: **mensaje real de WhatsApp desde el móvil → POST 200 en túnel → persistido en BD con wamid auténtico**. Recepción Meta→BD verificada de punta a punta.

**Commit.** `feat(api): webhook de recepción de WhatsApp (verificación, firma, dedupe, persistencia)`

**Notas operativas / deuda.**
- ngrok free: la URL cambia en cada reinicio del túnel → actualizar callback URL en Meta cada sesión de desarrollo con webhook.
- La suscripción app↔WABA vía Graph API es un paso de setup NO cubierto por el panel — añadido al conocimiento operativo (documentar en h2-webhook-setup.md).
- Higiene de secretos: rotar verify token (expuesto en chat de trabajo) y regenerar el token temporal del panel (ídem). El token permanente (System User) llega en T3 — tratamiento estricto desde el inicio.
- Deuda ya apuntada que sigue abierta: normalización de teléfonos H1↔E.164 (clientId null si no casa); 05-database-model.md desfasado.


### 2026-07-05 — H2: Alta en Meta for Developers + sandbox WhatsApp operativo

**Qué se hizo.** Registro completo de la infraestructura Meta para H2 (sin código). Cuenta de Facebook antigua saneada (email actualizado a uno con acceso, limpieza de emails muertos, 2FA). App **Onpilot** creada en Meta for Developers con caso de uso "Conectar con los clientes a través de WhatsApp" (solo WhatsApp — Instagram/otros casos descartados a propósito: son H4 y añaden fricción de revisión). Portfolio empresarial **Onpilot** nuevo y limpio (descartados portfolios personales antiguos). Plataforma WhatsApp Business activada con integración "Integrar con API" (Cloud API directa, sin BSP — coherente con la arquitectura del doc de feature). Permisos del token: solo la cuenta de test actual (mínimo privilegio), no cuentas futuras.

**Sandbox verificado.** Número de prueba asignado (+1 555 025-7710), Phone Number ID y WABA ID visibles en el panel. Móvil personal añadido como destinatario de prueba y verificado por código. Mensaje de plantilla enviado desde el panel y **recibido en WhatsApp real** → tubería de envío Meta→móvil funcionando de extremo a extremo. La recepción entrante (webhook) es la Tarea 2.

**Notas operativas.** El token del panel es temporal (24h) — en la Tarea 2/3 se generará uno permanente (System User); JAMÁS commitear tokens. "Hazte proveedor de tecnología" y "Publicar app" NO tocados: innecesarios para el MVP (modo desarrollo + sandbox basta). Paso 2 (número de producción + método de pago) diferido.

**Pendiente (ligado a lanzamiento, no al desarrollo).** La verificación de empresa (Paso 3) requiere entidad legal (autónomo/sociedad), que aún no existe. Sin ella no se sale del sandbox, pero el sandbox cubre TODA la Oleada 1 (5 destinatarios de prueba bastan para desarrollo y demos). Decisión de negocio: darse de alta (autónomo como opción ligera) antes de captar clientes reales — misma condición que ya impone la deuda RGPD (el contrato de encargado del tratamiento necesita entidad que firme). Añadido al criterio de lanzable de H2.


### 2026-07-04 — H2 Tarea 1: Schema de mensajería (Conversation + Message)

**Qué se hizo.** Primera tarea de H2 (WhatsApp Automático): cimiento de datos de mensajería. Entidades `Conversation` y `Message` + 3 enums (`ConversationStatus`, `MessageDirection`, `MessageAuthor`), migración `20260704210601_init_h2_messaging` con SQL manual para invariantes no expresables en Prisma (patrón `init_h1`). Solo schema+migración: cero controllers/services/endpoints/frontend. Documento de feature: `docs/features/h2-whatsapp-automatico.md`.

**Decisiones clave.**
- Reglas de oro de H1 aplicadas: `businessId` en ambas entidades, UUID v7 (`uuid(7)` verificado en ambos modelos), UTC, soft delete.
- `businessId` denormalizado en `Message` (además de en `Conversation`) a propósito: filtro multi-tenant directo sin join + habilita el índice de idempotencia por negocio.
- `clientId` nullable en `Conversation`: puede escribir un desconocido que aún no es cliente.
- Invariantes en SQL manual (append a la migración autogenerada):
  - Idempotencia de webhook: único parcial `(businessId, waMessageId)` WHERE `waMessageId IS NOT NULL AND deletedAt IS NULL` (Meta reintenta webhooks).
  - Una conversación abierta por teléfono/negocio: único parcial `(businessId, phone)` WHERE `status <> 'CLOSED' AND deletedAt IS NULL` — simplifica el webhook (T2): mensaje entrante → buscar la abierta o crearla. Las CLOSED se acumulan como historial.
  - CHECK coherencia dirección/autor: `IN`→`CLIENT`, `OUT`→`BOT|HUMAN`.
  - Índices de consulta: `Conversation(businessId,status,lastMessageAt)` (lista del panel), `Message(conversationId,createdAt)` (hilo).
- `onDelete: Restrict` en TODAS las FKs, incluida Message→Conversation. Razón: el proyecto usa soft delete (un Cascade nunca se dispararía legítimamente) y los mensajes son material de auditoría — un DELETE físico accidental debe fallar ruidosamente, no llevarse el hilo en silencio.
- `BotConfig` diferido a la Tarea 4 (BotEngine), donde habrá contexto para decidir entidad propia vs campos en Business.

**Verificación (psql, pruebas en transacción con rollback — 0 filas persistidas).** lint/typecheck/build OK, migración aplicada ("in sync"). `\d` de ambas tablas correcto (defaults, text, jsonb, FKs RESTRICT). Los 2 únicos parciales presentes con su WHERE + el CHECK. Pruebas de invariantes en ambas direcciones: IN+BOT falla (CHECK) / IN+CLIENT y OUT+HUMAN pasan; waMessageId duplicado mismo negocio falla (idempotencia); 2ª conversación BOT_ACTIVE mismo (business,phone) falla / tras cerrar la 1ª (CLOSED) pasa. H1 intacto (diff = solo relaciones inversas Business/Client + realineado de espacios).

**Commit.** `feat(api): schema de mensajería H2 (Conversation, Message) con invariantes SQL`

**Deuda nueva.** `docs/05-database-model.md` desfasado: describe un diseño PREVIO de mensajería distinto al construido (externalPhone/senderType/INBOUND-OUTBOUND/channel; sin waMessageId/contextSummary/businessId denormalizado). No es "faltan tablas" sino "diseño descartado documentado" — peor que incompleto. Alinear en microtarea de docs aparte, pronto. Al hacerla, decidir si `channel` (del diseño viejo) vuelve al schema en v2 multicanal o se queda como concepto del WhatsAppAdapter.

### 2026-07-04 — Vista semanal de Agenda (H1 frontend)

**Qué se hizo.** Añadida navegación semanal a la Agenda al estilo del demo: barra de semana + tabs de día (Lun–Dom) + lista de citas del día seleccionado. Sustituye la vista de un-día-con-flechas por una capa semanal encima de la lista existente. Solo frontend, cero backend (la API ya soporta rango `from&to`). Segunda tarea del plan de mejora del frontend tras el refinamiento de design tokens.

**Decisiones clave.**
- Envolver, no duplicar: se evolucionó `AgendaForZone` in situ (cambia solo la estrategia de fetch día→semana + se añade barra semanal y tabs). Lista, estados, modales y wrappers (crear/detalle/editar/cobrar/cancelar/no-show) reutilizados verbatim. `AgendaView` (guard de zona) intacto.
- Fetch semanal: una sola query `useAppointmentsList(weekBounds(weekAnchor, zone))` trae los 7 días; cambiar de día NO refetchea (filtrado en memoria vía `useMemo` → `Map<dayISO, Appointment[]>`). Las mutaciones invalidan `appointmentKeys.all` → la vista semanal se refresca sola.
- Estado local: `weekAnchor` + `selectedDay` + `modal` (ModalState igual que antes). Default de día seleccionado: hoy si la semana visible lo contiene, si no el lunes.
- Helpers de semana en `lib/appointments/day-range.ts` (co-localizados con `dayBounds`, zona-negocio + DST-safe, semana ISO lunes→domingo), NO en `lib/period.ts` (que está anclado a `now()` y lo usan Caja/Dashboard — se dejó intacto). Nuevos: `weekBounds`, `weekDays`, `shiftWeek`, `formatWeekRange` (contempla semana cruzando mes: "29 Jun — 5 Jul 2026"), `selectedDayForWeek`, `dayTabLabel`.
- Punto indicador bajo cada tab = día con ≥1 cita NO cancelada. Las canceladas siguen apareciendo en la lista al pinchar el día, solo se excluyen del indicador.
- WeekNav y DayTabs en archivos separados (no inline) por modularidad; botón "Hoy" deshabilitado en la semana actual.
- Rejilla read-only: pinchar card → modal detalle/editar existente. "+ Nueva cita" → modal crear existente. Cero UI de creación/edición nueva.

**Verificación (navegador, verificada por mí).** lint/typecheck/build OK sin levantar servidores. Confirmado con capturas: barra semanal con rango cruzando mes ("29 Jun — 5 Jul 2026"), tabs con puntos en días con citas (Lun–Vie con punto, Sáb–Dom sin), "Hoy" deshabilitado en semana actual, día vacío ("Sin citas este día"), día con citas (Lun 29: Favian 11:00 + Juan 13:00, cards reutilizadas con badge de estado), selección por defecto en hoy, filtrado por día instantáneo (en memoria).

**Archivos.** 2 nuevos (`agenda/week-nav.tsx`, `agenda/day-tabs.tsx`), 2 modificados (`agenda/agenda-view.tsx`, `lib/appointments/day-range.ts`). Cero backend, cero cambios en modales/mutaciones, `lib/period.ts` intacto.

**Commit.** `feat(web): vista semanal de agenda con navegación por semana y tabs de día`

**Deuda nueva (menor).** Se eliminó el `input[type=date]` de salto rápido a fecha arbitraria (lo suplen nav semanal + tabs, como el demo). Con solo flechas ±semana, llegar a una fecha lejana exige varios clics. Reintroducible después con un date-picker que lleve a la semana+día correspondiente si se echa en falta.

### 2026-07-04 — Refinamiento de design tokens del frontend H1

**Qué se hizo.** Refinamiento visual del frontend H1: de estética "Tailwind genérico frío" a la cálida/premium del demo (`docs/mockups/onpilot_demo.html`). Solo cosmética, cero lógica/estructura/backend. Cierra la deuda "Refinamiento de design tokens del frontend". Dividido en 3 subtareas con commit atómico + push por cada una.

**Decisiones clave.**
- Enfoque: auditoría read-only primero, luego config global (`globals.css` / `@theme`) preferida sobre edición por componente → menor superficie. La app resultó no tener clases `slate-*`/`gray-*` sueltas: todo centralizado en 6 tokens semánticos, lo que hizo el cambio quirúrgico.
- T1 grises: remapeo de los 6 tokens semánticos (`--background/--foreground/--ink/--label/--faint/--border` → escala cálida `--bg/--g50…--g800`) + 2 hex fríos hardcodeados en TSX. `--foreground` e `--ink` unificados a `#1A1410` (antes diferían mínimamente, ambos casi-negro). `bg-white` (51 usos) intencionalmente intacto — no es gris frío.
- T2 sombras+radios: sombras con tinte marrón (`--shsm 0 2px 8px rgba(80,40,20,.07)`, `--shmd`) vía `@theme`. Radios por bump global de escala (Estrategia A): tarjetas `rounded-xl`→18px, modales/featured `rounded-2xl`→22px; `rounded-lg` (8px) y `rounded` (4px) sin tocar. Consecuencia aceptada: inputs/textareas también a 18px (superficie mínima vs precisión). Thumb del toggle VIP a sombra cálida.
- T3 componentes: card "Facturado" (Inicio+Caja, componente `KpiCard` compartido) con gradiente `linear-gradient(135deg,#1D9E75,#0a5c42)` + sombra verde + texto blanco 800 / label blanco/80. KPIs a `text-3xl` 800. Títulos de sección/página a 800. 5 CTAs primarios verde→negro cálido (`#1A1410`, hover `#2d2520`) en forma pastilla (`+Nueva cita`, `+Nuevo cliente`, `Crear el primero`, `Cobrar y cerrar`, `Button` compartido de submits).
- Clasificación quirúrgica CTA-vs-acento en T3: verde marca/estado preservado (tab activo, tab de período en Caja, track del toggle VIP, badges VIP/NEW/estado, logo, `text-brand` de importes). Solo botones de acción primaria → negro.
- Fuera de alcance (por decisión de superficie): ficha de cliente en B2 (su `StatCard` en grid de 4 col. se apretaría con números a 28px); botones secundarios (Cancelar/Editar/nav día — ya tenían borde g200).

**Verificación (navegador, verificada por mí pantalla a pantalla).** Cada subtarea: lint/typecheck/build OK sin levantar servidores (Claude Code solo estático). Capturas de Inicio/Agenda/Clientes/Caja + modal por cada subtarea antes de aprobar commit. T3 confirmado: gradiente diagonal correcto, KPIs con presencia, CTAs negros pastilla, ningún verde de marca/estado convertido a negro por error.

**Commits (en origin/main).**
- `style(web): warm gray scale (design tokens 1/3)`
- `style(web): warm shadows + generous radii (design tokens 2/3)`
- `style(web): KPI gradient, weight contrast, dark CTAs (design tokens 3/3)`

**Deuda cerrada.** ✅ Refinamiento de design tokens del frontend.
**Deuda nueva (menor, no bloqueante).** Nav de agenda (flechas prev/next/Hoy) a 8px mientras las tarjetas subieron a 18px — se ve bien, no ajustado; reevaluar si molesta. `bg-white` (51 usos) blanco puro sobre fondo cálido — funciona con las sombras de T2; pasar a `--g50` si en algún punto canta. Ficha de cliente sin tipografía KPI 800 (grid de 4 col.) — unificar si canta. Botones secundarios sin restylear.

### 2026-07-04 — Rate limiting en Auth (@nestjs/throttler)

**Qué se hizo.** Añadido rate limiting por IP en los endpoints de autenticación con @nestjs/throttler, para frenar fuerza bruta y abuso de registro. Cierra la deuda "Rate limiting en Auth". Backend puro.

**Decisiones clave.**
- Ámbito solo-Auth: ThrottlerModule registrado dentro de AuthModule (no global); ThrottlerGuard aplicado por ruta solo en login/register/refresh. logout, me y H1 quedan intactos sin necesidad de @SkipThrottle (el guard ni se pone en ellos). Blast radius mínimo.
- Límites (constantes en auth.throttle.ts, sin env vars): login 5/min, register-business 3/min, refresh 10/min (laxo — no romper bootstrap/single-flight/multi-pestaña legítimos). Ventana 60s.
- Storage en memoria (default del throttler), suficiente para MVP monoinstancia; Redis se difiere.
- 429 con mensaje genérico de NestJS (no filtra credenciales). El throttler cuenta por IP, no registra el body.

**Verificación (curl directo a :4000).** lint/typecheck/build OK. login: 6 intentos rápidos → 5×401 + 1×429 (429 por nº de intentos, no por resultado). register: 4º → 429 (límite 3). H1 sin throttle: GET /clients ×12 sin token → 401 (nunca 429), ×8 con token → 200. Login aislado tras reset → funciona (no molesta al uso normal).

**Commit.** `feat(api): rate limiting en Auth con @nestjs/throttler (login 5/min, register 3/min, refresh 10/min)`

**Deuda cerrada.** ✅ Rate limiting en Auth.
- [ ] **trust proxy NO configurado (DESTACADA).** Sin él, el rate limiting por IP no protege
  bien en producción tras el proxy (Railway) ni desde el navegador vía rewrites de Next —
  todas las peticiones aparentan venir de la IP del proxy. Configurarlo correctamente antes
  de producción (hacerlo mal permite spoofing de X-Forwarded-For). Además: storage del
  throttler en memoria → Redis si multi-instancia. _(Generado en Rate limiting, 04/07/26.)_
  Nota (06/07/26): con el webhook de H2 detrás de ngrok en desarrollo, el efecto ya es
  visible — todas las peticiones aparentan venir del túnel. Al configurarlo en producción,
  contemplar también las rutas de messaging, no solo Auth.

### 2026-07-04 — AuditLog transversal (solo escritura)

**Qué se hizo.** Implementado el registro de auditoría para las 16 acciones de H1. El modelo AuditLog existía desde la Tarea 1 pero nadie escribía en él; ahora cada acción relevante deja rastro. Cierra la deuda transversal de auditoría (7 fuentes: auth, clientes, servicios, citas, cobros). Solo escritura — la consulta/lectura queda diferida (acoplada al futuro RolesGuard).

**Decisiones clave.**
- AuditService central en AuditModule @Global (patrón PrismaModule). record() escribe el log en try/catch que NUNCA lanza (loguea el error con el Logger de Nest, sin incluir metadata en el mensaje).
- Emitido desde el CONTROLLER (tras resolver el service), NO desde el service: así queda fuera del $transaction por construcción → post-commit y no-bloqueante garantizados sin tocar la lógica transaccional. Evita reescribir firmas de ~15 métodos de servicio.
- Solo se audita la acción efectiva: si el service lanza (404/409/validación), el await corta antes del record → no hay log de acciones que no ocurrieron.
- @AuditMeta() param-decorator para ip/userAgent (DRY, no acopla AuditService a Express). audit.actions.ts con constantes (evita typos en 16 sitios). Formato action = entidad.accion (client.create, service.delete, payment.mark_error, auth.login...).
- Multi-tenancy: businessId del backend (@BusinessId), null en auth login/logout. Logout resuelve userId del refresh token (decisión 3b), sin registrar el token. Services delete INCLUIDO (borrado auditable). metadata mínima no sensible (VIP: {isVip,%}; cancel/mark-error: {reason}).
- Seguridad: nunca contraseñas, tokens/hashes, secrets ni datos clínicos en el log.

**Verificación (server real + curl + psql).** lint/typecheck/build OK. 18 filas en AuditLog, una por acción, con businessId/userId/action/resourceType/resourceId correctos. businessId NULL solo en auth. metadata solo con datos de gestión, sin secretos. Endpoints responden igual que antes (201/204/409). Acción fallida (409 teléfono duplicado) NO deja log. NO-BLOQUEO verificado renombrando la tabla AuditLog: con el log roto, client.create persiste el cliente igual y el fallo se captura sin propagar. Tabla restaurada.

**Commit.** `feat(api): AuditLog transversal de escritura para acciones de H1 (...)`

**Deuda cerrada.** ✅ AuditLog transversal (las 5 fuentes: Auth, Clients, Services, Appointments, Payments).
**Deuda nueva.** Consulta/lectura de AuditLog (endpoint GET + pantalla) — diferida, acoplada al futuro RolesGuard. Acciones auditables fuera de H1 (register-business, refresh, cambio de password, gestión de herramientas, backoffice) — cuando existan esas features.

### 2026-07-01 — Microtareas de docs: alinear contratos y workflow con el código

**Qué se hizo.** Cerradas dos inconsistencias de documentación. (1) docs/06-api-contracts.md: GET /appointments documentado como { items: [...] } → corregido a array pelado, que es lo que devuelve el código. (2) docs/10-development-workflow.md: el flujo omitía APROBACIÓN y REVISIÓN → alineado con CLAUDE.md (7 pasos), diagrama + secciones numeradas, con las descripciones de ambos pasos nuevos.

**Verificación.** Diff revisado: solo docs, sin referencias cruzadas rotas por la renumeración. Sin tocar código.

**Commit.** `docs: align api-contracts and workflow with code (close doc debt)`

**Deuda cerrada.** ✅ Inconsistencia GET /appointments {items} vs array. ✅ Falta paso REVISIÓN en workflow (y de paso APROBACIÓN).

### 2026-07-01 — Ficha enriquecida de cliente (backend + frontend)

**Qué se hizo.** Enriquecida la ficha de cliente end-to-end. Backend: ampliado GET /clients/:id (aditivo, enfoque A) para devolver además de los datos básicos: stats (totalVisits, totalSpent, averageTicket, lastVisitAt, nextAppointmentAt), historial de citas pasadas (~10), próximas citas activas (~10) y cobros recientes (~10). Frontend: sustituido el bloque "Próximamente" de /clientes/[id] por métricas + próximas citas + historial de citas + historial de cobros. Cierra la deuda "Ficha enriquecida de cliente".

**Decisiones clave.**
- Enfoque A (un solo endpoint ampliado), pero servicio MODULAR por dentro: findBasic (solo datos, usado por update/updateVip para no disparar agregaciones) separado del enriquecido (getOne público, usado por la ficha).
- Multi-tenancy: gate findFirst con businessId → 404 ANTES de agregar nada; cada agregación filtra por businessId + clientId. Aislamiento por construcción.
- totalVisits = citas COMPLETED. totalSpent = cobros PAID (Decimal). averageTicket = totalSpent/nº PAID con guard de 0. Regla de oro: dinero en Decimal, Number solo al serializar. Payment sin deletedAt (se filtra por estado); Appointment sí.
- Listas separadas (próximas / historial citas / historial cobros), coherente con las secciones de la ficha. Límite 10 por lista, sin paginación.

**Verificación.** lint/typecheck/build verde. Cambio aditivo (campos actuales intactos; update/updateVip usan findBasic sin agregaciones). Manual (navegador): ficha de Favian con stats reales coherentes (2 visitas, gasto 36€ = 2×18, ticket 18€, última visita 29 jun); 3 secciones con datos correctos (cancelada no cuenta como visita/gasto); ID inexistente → 404 (gate multi-tenant); listado y edición de clientes siguen OK.

**Commit.** `feat(api,web): ficha enriquecida de cliente (stats + historial)`

**Deuda cerrada.** ✅ Ficha enriquecida de cliente.
**Deuda nueva.** Tags por actividad (REACTIVATE/REGULAR) — fuera de esta tarea, computeTags sigue en VIP/NEW. Cita activa vencida sin cerrar (SCHEDULED/CONFIRMED con startsAt pasado) no aparece ni en próximas ni en historial (aceptable MVP).

### 2026-06-28 — frontend Dashboard de H1 como home (/inicio)

**Qué se hizo.** Pantalla de panel en /inicio con los 8 KPIs de H1, convertida en home (/ redirige a /inicio en vez de /agenda) con su entrada de nav. Solo lectura. Cierra el shell completo (4 secciones: Inicio / Agenda / Clientes / Caja). Sin tocar backend.

**Decisiones clave.**
- Dashboard como HOME (no tab secundaria): será el centro de mando del producto cuando lleguen H2/H4/H5. Ruta propia /inicio (slug en español, coherente con /agenda /clientes /caja) y / redirige ahí. Entrada "Inicio" primera en el nav (icono LayoutDashboard); desktop-nav y bottom-nav iteran NAV_ITEMS → añadir el item los actualiza ambos sin tocarlos.
- Tarjeta KPI reutilizable (label + value + subtitle? + highlight?), pensada para crecer. 7 tarjetas + sección topServices. Facturado este mes destacado.
- Consume GET /api/dashboard/h1 (sin query params; los límites hoy/mes los calcula el backend en la zona del negocio). Importes solo display (formatEur, regla de oro). clientsToReactivate como conteo con subtítulo ("+60 días"), sin enlace a lista (no hay endpoint). Subtítulos aclaratorios en próximas citas y reactivar.
- Alcance estricto: solo los 8 KPIs de H1. KPIs de otras herramientas (WhatsApp/redes) fuera — no existen aún.
- TopService local en lib/dashboard (sin acoplar a lib/cash).

**Verificación.** lint/typecheck/build verde (/inicio en el build, resto intactas). Manual (navegador): / redirige a /inicio; las 4 tabs navegan y marcan activa (Inicio primero); dashboard con datos reales; verificación cruzada con Caja (facturado este mes 54€ coincide entre dashboard y caja — dos endpoints, mismo resultado); bottom-nav móvil con las 4 secciones.

**Commit.** `feat(web): dashboard de H1 como home (/inicio) + entrada de nav`

**Deuda generada.** Dashboard sin deltas/sparklines ni comparativas (sin histórico — el backend no da serie temporal). clientsToReactivate es conteo, no lista navegable (no hay endpoint de lista de reactivación). El dashboard crecerá con KPIs de H2/H4/H5 cuando existan.


### 2026-06-28 — frontend Caja: cierre de caja por periodo

**Qué se hizo.** Pantalla Caja en /caja (solo lectura): resumen de cobros por periodo (Hoy / Esta semana / Este mes / Este año), consumiendo GET /api/cash/summary. Cierra la tercera sección del shell. Sin tocar backend.

**Decisiones clave.**
- Helper genérico periodBounds(period, zone) en lib/period.ts (NO acoplado a cash ni a citas): traduce hoy/semana/mes/año a rango from/to en la zona del negocio con luxon (DST-safe, semana en lunes ISO). Reutilizable por el Dashboard frontend futuro.
- Periodo por defecto: Hoy. Etiqueta "Cobros" (no "Clientes atendidos" del mockup, que sería engañoso: paymentsCount son cobros, no clientes distintos).
- KPIs: Facturado (destacado), Ticket medio, Cobros, Servicio top. Desgloses: servicios por facturación (top 5) y por método de pago (labels de PAYMENT_METHODS reutilizados de lib/payments). errorsCount como línea sutil solo si >0.
- Importes solo display (regla de oro): formatEur sobre los number del backend, cero recálculo. Estados carga/error/vacío ("Sin transacciones en este período").
- Gráfico "facturación últimos 6 meses" → "Próximamente" (el endpoint no da serie temporal). "Últimas transacciones" del mockup fuera (requeriría GET /payments por rango).

**Verificación.** lint/typecheck/build verde. periodBounds validado con luxon aislado: semana lunes local, mes 1→fin local, año 1-ene→31-dic local, todo a UTC con offset, DST-safe (año arranca invierno +01:00, mes julio verano +02:00); zona del negocio no del navegador. Manual (navegador): caja con datos reales; el cobro de la Pieza 3 (Favian, Bizum 18€) aparece; coherencia al céntimo (Facturado 54€ / 4 cobros / ticket 13,50€; desglose por método suma el total).

**Commit.** `feat(web): pantalla Caja (cierre de caja por periodo, tz-aware)`

**Deuda generada.** Gráfico "facturación últimos 6 meses" pendiente (requiere serie temporal — endpoint nuevo o N llamadas). "Últimas transacciones" del mockup pendiente (requiere GET /payments por rango; /cash/summary solo da agregados). lib/period.ts listo para el Dashboard frontend.

### 2026-06-28 — frontend Agenda Pieza 3: gestión de estado + cobro inline

**Qué se hizo.** Tercera y última pieza de la Agenda; cierra el ciclo de vida de una cita desde su detalle: cancelar (motivo opcional), marcar no-show, y el cobro inline "Cobrar y cerrar" consumiendo el módulo Payments. Con esto la Agenda queda completa (vista + crear/editar + estado/cobro).

**Decisiones clave.**
- REGLA DE ORO MONETARIA hecha imposible de violar por tipos: CreatePaymentPayload NO tiene campo finalPrice. El front envía solo manualDiscountAmount + paymentMethod; el backend calcula el finalPrice con Decimal. La previsualización del total en el front (base − VIP − manual) es SOLO orientativa; el importe que se muestra/persiste tras cobrar es resp.finalPrice del backend.
- Cobro: desde detalle de cita activa → modal propio. Precio base (del servicio de la cita), descuento VIP automático (vía useClient para previsualizar isVip/vipDiscountPercent), descuento manual en € (manualDiscountAmount, no % — el DTO es importe), método de pago (default CASH). Éxito muestra "Cobrado {finalPrice}€" del backend y auto-cierra a 1,5s solo en éxito (en error permanece con el mensaje). Tras cobrar, la cita pasa a COMPLETED atómicamente.
- Errores mapeados: 409 → "Esta cita ya está cobrada" (doble cobro); 400 "exceed" → "Los descuentos superan el precio base". No genéricos.
- Label "Cobrada" para COMPLETED en la UI (estado backend sigue COMPLETED), coherente en lista y detalle.
- Cancelar: motivo opcional + confirmación → CANCELLED. No-show: confirmación simple → NO_SHOW. Reutilizado confirm-dialog (props aditivas loadingLabel/error) para no-show. Citas terminales no ofrecen acciones.
- Nueva capa lib/payments (types/api/queries) + lib/format (formatEur). Sin tocar backend.

**Verificación.** lint/typecheck/build verde. Regla de oro validada con números (base 20 / VIP 10% → 18; 45/VIP → 40,50). Manual (navegador): cobro VIP exacto (Favian, base 20 − 10% = 18,00€ al céntimo, coincide front/backend); descuento manual aplicado; doble cobro bloqueado (cita Cobrada no ofrece cobrar); descuentos > base → 400 claro; cancelar → CANCELLED atenuada; no-show → NO_SHOW.

**Commit.** `feat(web): agenda — cobro inline + cancelar/no-show (regla de oro monetaria)`

**Deuda generada.** Detalle de cita COMPLETED no muestra el desglose del cobro realizado (requeriría GET /payments por cita) — solo el badge "Cobrada". Descuento manual en € (se omite el % del mockup, que era incoherente con el DTO). Selector de método de pago añadido (no estaba en el mockup).

### 2026-06-28 — frontend Agenda Pieza 2: crear / editar / detalle de cita

**Qué se hizo.** Segunda pieza de la Agenda. La vista de día ahora es escribible: botón "Nueva cita" (prefijado al día visible + próxima hora en punto), tarjetas clicables → modal de detalle → editar. Formulario de cita reutilizable (alta + edición) con selección de cliente y servicio. Todo contra la API real, sin tocar backend.

**Decisiones clave.**
- Timezone en AMBAS direcciones con luxon (helpers puros en day-range): buildStartsAt (día+hora en zona del negocio → ISO con offset, lo que exige el backend) y splitInstant (su inverso, para prefijar la edición convirtiendo el startsAt UTC a hora local). nextRoundTime para el default. Round-trip verificado, incluido día de cambio DST.
- Edición envía solo dirtyFields (RHF): así editar solo las notas no reenvía un startsAt antiguo que dispararía el 400 de "pasado". clientId inmutable en edición (regla del backend respetada en UI: cliente como disabled, no se envía).
- Mapeo de errores específico: 409 → "franja ya ocupada"; 400 → pasado / servicio inactivo / cliente no válido; fallback genérico. No genéricos.
- Botón "Editar" solo en SCHEDULED/CONFIRMED; citas terminales (COMPLETED/CANCELLED/NO_SHOW) no se editan (regla del backend en UI).
- Selección sobre datos reales (no autocomplete de texto libre del mockup): select de clientes (limit 100, orden por nombre) + select de servicios activos con etiqueta "nombre · duración · precio" (precio solo display). source NO se envía (el backend fija MANUAL).
- Nueva capa lib/services (types/api/queries) para el selector. Máquina de modales none|create|detail|edit. Sin cancelar/cobrar (Pieza 3).

**Verificación.** lint/typecheck/build verde. Luxon aislado: buildStartsAt con offset correcto por zona/estación (Madrid verano/invierno, Canarias, NY); splitInstant inverso exacto incluido DST; usa zona del negocio no del navegador. Manual (navegador): crear cita → aparece sin recargar; hora se guarda con offset correcto; 409 de solapamiento con mensaje claro; editar refleja cambios (cliente inmutable); fecha en pasado → mensaje claro; selector de servicio vacío → "crea un servicio primero".

**Commit.** `feat(web): agenda — crear/editar/detalle de cita (modales, tz-aware)`

**Deuda generada.** Buscador de cliente cuando la base supere ~100 (hoy limit 100 + orden por nombre en cliente; GET /clients ordena por createdAt). source/"Canal de reserva" del mockup omitido (backend fija MANUAL).

### 2026-06-28 — frontend Agenda Pieza 1: vista de día (solo lectura)

**Qué se hizo.** Primera de las tres piezas de la Agenda. Vista de día en /agenda (solo lectura): citas del día en lista ordenada por hora, navegación temporal (hoy / día anterior-siguiente / selector de fecha), cada cita con hora, cliente, servicio y badge de estado coloreado. Estados de carga/error/vacío. Consume GET /api/appointments con from/to del día.

**Decisiones clave.**
- PRIMER consumidor de Business.timezone en frontend. Desviación mínima de backend: expuesto timezone en /api/auth/me (campo añadido en CurrentBusinessContext + jwt-auth.guard; el include de business ya lo traía, me() no se tocó). Los límites del día se calculan en la zona del negocio con luxon (DST-safe), no en la del navegador. Coherente con el Dashboard backend.
- luxon en el frontend (misma librería que el backend; no se metió date-fns).
- Capa de datos appointments espejo de la de Clientes (types/api/queries + day-range). Respuesta tipada como array pelado (código real, no {items} del doc). Cada cita embebe client y service.
- Color por estado: CONFIRMED verde, SCHEDULED azul/claro, COMPLETED gris, CANCELLED rojo atenuado, NO_SHOW ámbar. Canceladas/no-show atenuadas, no ocultas.
- Vista de DÍA con lista ordenada por hora (no grid de franjas, no semana). Solo-lectura estricto (sin crear/editar/cobrar — Piezas 2-3).

**Verificación.** lint/typecheck/build en verde. dayBounds DST-safe verificado con luxon aislado (Madrid verano/invierno/día de cambio DST, New York). /me devuelve activeBusiness con timezone sin romper login/bootstrap/F5. Manual (navegador): la agenda carga, navega entre días, estado vacío correcto, y con citas sembradas por curl se pintan las tarjetas con hora en zona del negocio (11:00/13:00 Madrid), cliente, servicio y badge.

**Commit.** `feat(web): agenda vista de día (solo lectura) + timezone en /me`

**Deuda generada.** Inconsistencia doc: 06-api-contracts documenta GET /appointments como {items} pero el código devuelve array pelado — alinear el doc (microtarea). Las Piezas 2 (crear/editar) y 3 (estado + cobro inline) de la agenda quedan pendientes.

### 2026-06-27 — frontend Clientes básica + TanStack Query

**Qué se hizo.** Tercera pieza de frontend y PRIMERA pantalla de datos. Pantalla Clientes contra la API real: listado con búsqueda (debounce 300ms) y paginación, crear/editar (modal con ClientForm reutilizable), toggle VIP + %, borrado soft con confirmación, y ficha /clientes/[id] con los datos que el backend da hoy. Introducido TanStack Query como capa de datos del frontend.

**Decisiones clave.**
- Ficha BÁSICA: solo datos del cliente (nombre, teléfono, email, notas, VIP+%, "cliente desde", tags). Las secciones de stats/historial/próximas citas del mockup → bloque "Próximamente" (requieren endpoint nuevo; ficha enriquecida será otra tarea).
- TanStack Query sobre api-client (apiRequest con Bearer + refresh single-flight); no se reinventa el fetch. Query keys centralizadas (clientKeys), invalidación de clientKeys.all tras cada mutación. Provider acotado al layout de (app).
- Retry de TanStack configurado para NO reintentar 4xx (el 401 lo gestiona api-client; 404/409 son definitivos); solo reintenta errores de red. No compite con el refresh.
- vip-toggle: una sola mutación, controles bloqueados mientras isPending, % resincronizado por render-pattern (sin useEffect en cascada).
- Primitivas de formulario PROMOVIDAS de components/auth/ui.tsx a components/ui/form.tsx (las usan login/registro + clientes). Extraído client-bits.tsx (avatar+chip) para no duplicar entre lista y ficha.
- Ruta /clientes/[id] (lista → ficha, página propia). Slugs español. Modal para alta/edición. 409 de teléfono → error en el campo phone.

**Verificación.** lint/typecheck/build en verde (login/registro siguen OK tras mover ui.tsx). Manual (navegador): listado (vacío/con datos/búsqueda/paginación); crear → aparece sin recargar (invalidación); editar/VIP/borrar con confirmación; ficha con datos + "Próximamente"; teléfono duplicado → error en campo. Sin levantar servidores en el CHECK automatizado.

**Commit.** `feat(web): pantalla Clientes básica (lista, ficha, CRUD, VIP) con TanStack Query`

**Deuda generada.** Ficha enriquecida (stats/gasto/historial/próximas citas) pendiente — requiere endpoint backend que agregue datos del cliente (cierra también la deuda vieja de "ficha enriquecida"). Edición de notas via modal, no autosave (decisión de scope).

### 2026-06-27 — frontend layout + navegación: carcasa H1

**Qué se hizo.** Segunda pieza de frontend: la carcasa (shell) de la zona protegida con navegación persistente entre las secciones de H1 (Agenda, Clientes, Caja). Tabs superiores en desktop + bottom-nav en móvil, marca de sección activa por ruta, nombre del negocio y logout integrados. Páginas placeholder por sección. Sin pantallas de datos ni llamadas a la API.

**Decisiones clave.**
- Navegación según el MOCKUP real (docs/mockups/onpilot_agenda.html): tabs en desktop + bottom-nav en móvil. Se descartó el rail/sidebar izquierdo (el d-sidebar del mockup era la lista de clientes, contenido de pantalla, no navegación; con 3 secciones un rail es excesivo).
- Slugs en español: /agenda, /clientes, /caja. / → redirect a /agenda. (Las llamadas a la API siguen siendo /api/clients etc.)
- lucide-react para iconos (Calendar, Users, BarChart3, LogOut), equivalentes a los Tabler del mockup.
- El shell reutiliza ProtectedRoute y useSession existentes (no se reinventan). Se monta solo con sesión autenticada.
- Mockups añadidos al repo en docs/mockups/ como referencia de diseño.

**Verificación.** lint/typecheck/build en verde. Manual (navegador): / redirige a /agenda; las tabs (desktop) y la bottom-nav (móvil) navegan entre las 3 secciones y marcan la activa; negocio + logout integrados; logout → /login; responsive (tabs ≥md, bottom-nav <md) confirmado estrechando la ventana; sin sesión → /login.

**Commits.** `docs: add UI mockups for reference` + `feat(web): app shell con navegación H1 (tabs desktop + bottom-nav móvil)`

**Deuda generada.** Placement del logout en móvil (topbar compacta) pendiente de validación visual fina. El Dashboard (backend ya hecho) no tiene sección de nav todavía — será su propia pantalla/tarea. Pantallas de datos de cada sección pendientes (tareas aparte).

### 2026-06-27
 — frontend-auth: cookie httpOnly + cimientos de auth en web

**Qué se hizo.** Primera tarea de frontend (apps/web, Next.js 16) + reapertura acotada del backend de auth. Cimientos de autenticación en cliente y pantallas de login y registro de negocio.

BACKEND (acotado): el refresh token pasa a viajar en cookie httpOnly (antes en el body). login/register-business setean la cookie y devuelven solo el access en el body; refresh lee la cookie, rota y setea la nueva; logout limpia la cookie. Añadido cookie-parser y helper auth.cookies.ts (flags: httpOnly, secure en prod, sameSite 'strict', path '/api/auth', maxAge 7d). La rotación y la detección de reuso de Auth-3 se mantienen intactas (verificado). Eliminado refresh-token.dto.ts (refresh/logout ya no usan body).

FRONTEND: access token solo en memoria (token-store), nunca en localStorage. api-client.ts: wrapper de fetch con credentials:'include', añade Bearer, y ante 401 hace refresh single-flight + reintento. session-context: bootstrap al montar (llama /refresh, la cookie viaja sola, recupera access + /me) — guardado con useRef para no duplicar en StrictMode. Rutas protegidas client-side. Login + registro con React Hook Form + Zod. DM Sans global, tokens de marca. Front→API vía rewrites de Next (mismo origen, sin CORS).

**Decisiones clave.** Cookie httpOnly (no localStorage) por seguridad ante XSS y para sobrevivir al F5. Rewrites de Next en vez de CORS. Zod + RHF + Context propio (sin TanStack Query ni Zustand todavía).

**Verificación.** Automatizado: typecheck/lint/build (api+web). Backend (curl+psql): login/register setean cookie sin refresh en body; refresh rota; reuso de cookie revocada → 401 + revoca familia; logout limpia cookie. Single-flight: 3 refrescos secuenciales sin falsas revocaciones. Visual (navegador): registro→home; F5 mantiene sesión; logout→login + cookie borrada + F5 no recupera; login bueno entra/malo error genérico; DevTools confirma onpilot_rt HttpOnly+Strict+path /api/auth y localStorage sin tokens.

**Commit.** `feat(auth): refresh token en cookie httpOnly + cimientos de auth en web`

**Deuda generada.** CSRF token explícito si en el futuro se relaja sameSite a lax/none (ahora sameSite:strict es mitigación suficiente). Cosmético: el 401 esperado de /refresh tras logout/sin-sesión aparece como error en consola; se puede silenciar (no funcional).

### 2026-06-24 — Dashboard H1: KPIs con timezone, conteo de reactivación

**Qué se hizo.** Octavo recurso H1, de solo lectura. DashboardModule con GET /dashboard/h1: 8 KPIs del negocio (todayAppointments, upcomingAppointments, todayRevenue, monthRevenue, newClientsThisMonth, averageTicket, topServices, clientsToReactivate).

**Decisiones clave.**
- PRIMER consumidor real de Business.timezone. Añadido luxon: los límites "hoy"/"mes" se calculan en la zona del negocio (DST correcto) y se convierten a UTC para las queries.
- clientsToReactivate vía $queryRaw PARAMETRIZADO (Prisma no expresa bien la condición compuesta: ≥2 COMPLETED ∧ última COMPLETED < hoy−60d ∧ NOT EXISTS cita futura activa, no VIP, no borrado). Cada subquery filtra por businessId. Es un conteo, no una lista (sin datos personales).
- Dinero en Decimal; averageTicket del mes con guard de 0. topServices forma de Cash (sin refactorizar). period/from/to ignorados (todo desde "ahora" del negocio).
- REACTIVATE_DAYS=60 comentada en código.

**Verificación (server real + curl + psql).** KPIs cuadrados contra datos deterministas. AISLAMIENTO del $queryRaw A↔B (A=1, B=2, sin cruce) + las 4 condiciones de reactivación con variantes que fallan cada una + no cuenta borrados. TIMEZONE/DST: cobro 00:30 local cuenta hoy, 23:30 del día previo local no. 401 sin token. lint/typecheck/build OK. Data limpiada.

**Commit.** `feat(api): add Dashboard H1 module (timezone-aware KPIs, reactivation count)`

**Deuda generada.** clientsToReactivate vía $queryRaw (revisar índice si crece). Duplicación de la agregación mensual con Cash (posible helper común a futuro). Helper de límites tz con luxon vive en el servicio (extraíble si otro módulo lo necesita).

### 2026-06-24 — Cash: cierre de caja básico

**Qué se hizo.** Séptimo recurso H1, de solo lectura. CashModule con GET /cash/summary?from&to que agrega los cobros del negocio en un rango sobre paidAt, vía agregaciones nativas de Prisma (aggregate/groupBy). Devuelve totalRevenue, paymentsCount, averageTicket, byPaymentMethod[], topServices[] (top 5) y errorsCount.

**Decisiones clave.**
- Solo cobros PAID suman; los ERROR se reportan aparte en errorsCount (no inflan la caja). REFUNDED ignorado en MVP.
- Todo en Prisma.Decimal; number solo display. averageTicket con guard de división por cero (0 cobros → 0).
- from/to OBLIGATORIOS (400 si faltan), ISO-8601 con offset de zona (consistente con Appointments). from>to → 400.
- topServices: una lista ordenada por facturación, top 5; cobros sin serviceId omitidos de topServices pero contados en total/byPaymentMethod. Servicio borrado conserva su nombre (caja histórica).

**Verificación (server real + curl + psql).** total 240.00/5 cuadrado exacto contra psql; averageTicket 48; byPaymentMethod ordenado; ERROR en errorsCount sin inflar total; sin-servicio en total pero fuera de topServices; servicio borrado conserva nombre; fuera de rango excluido; rango vacío→0 sin división por cero; aislamiento A↔B; 400 fecha sin offset/falta/from>to; 401 sin token. lint/typecheck/build OK. Data limpiada.

**Commit.** `feat(api): add Cash module (cash closing summary over payments)`

**Deuda generada.** Ninguna.

### 2026-06-24 — Payments: cobro con descuento VIP, atomicidad y multi-tenancy

**Qué se hizo.** Sexto recurso H1 y la pieza del dinero. PaymentsModule (POST create, GET list, GET :id, PATCH :id/mark-error). El backend calcula basePrice (del servicio), vipDiscountAmount, finalPrice; status PAID, paidAt y createdById fijados en backend. Si hay appointmentId, marca la cita COMPLETED en la misma transacción.

**Decisiones clave.**
- Cálculo monetario 100% en Prisma.Decimal (.mul/.div/.sub + toDecimalPlaces(2, ROUND_HALF_UP) en el VIP); el number de la respuesta es solo display (regla de oro). Nunca se acepta basePrice/finalPrice del frontend.
- basePrice: del servicio de la cita si hay appointmentId; serviceId explícito para cobro manual; sin servicio → 400 (cobro de importe libre no soportado en MVP).
- finalPrice ≥ 0 obligatorio (descuentos que lo dejan negativo → 400, no se capa a 0).
- Atomicidad: create payment + cita→COMPLETED en $transaction; el updateMany de la cita exige status IN [SCHEDULED,CONFIRMED] y count===1, si no revierte (cubre race con cancelación).
- Un cobro por cita: el 409 lo dispara primero el guard de estado terminal (cita COMPLETED tras el 1er cobro); el @unique(appointmentId) queda como backstop de la race teórica.
- Coherencia client/service del DTO con la cita validada. mark-error no revierte el estado de la cita (MVP). Servicio inactivo no revalidado (coherente con Appointments).
- Listado sin paginación, orden paidAt desc.

**Verificación (server real + curl + psql).** Cobro VIP base 45 / vip 4.50 / final 40.50 EXACTO en BD (Decimal, sin floats). Cita→COMPLETED atómico. finalPrice<0→400, 2º cobro→409, incoherencias→400, mark-error→ERROR sin revertir cita, aislamiento A↔B→404, 401 sin token, cobro manual sin cita OK, sin servicio→400. Los rechazados NO dejaron fila (atomicidad confirmada). lint/typecheck/build OK. Data limpiada.

**Commit.** `feat(api): add Payments module (charge with VIP discount, tenancy & atomic completion)`

**Deuda generada.** AuditLog de cobros (create, mark-error) → suma a la deuda transversal. Cobro de importe libre sin servicio no soportado (MVP).

### 2026-06-16 — Appointments: CRUD + cancel + no-show + validaciones

**Qué se hizo.** Tercer recurso H1, el primero con lógica de negocio compleja. AppointmentsModule (6 endpoints: list con filtros from/to/status/clientId, create, getOne, update, cancel, no-show). endsAt calculado en backend desde service.durationMinutes; status default CONFIRMED, source MANUAL fijado en backend, createdById del @CurrentUser().

**Decisiones clave.**
- Formato de startsAt: ISO-8601 con offset de zona OBLIGATORIO (@Matches exige Z o ±HH:MM, porque @IsISO8601 acepta cadenas sin zona). Solo así la comparación no-pasado en UTC es inequívoca. Documentado: si el frontend pasa a enviar hora local, entrará Business.timezone.
- Pertenencia multi-tenant (novedad): client y service validados con findFirst {id, businessId, deletedAt:null}; service además isActive:true. Ajeno/inexistente/inactivo → 400.
- Solapamiento: bloquea contra citas SCHEDULED/CONFIRMED por intersección estricta (startsAt < otherEnds && endsAt > otherStarts); adyacente exacto permitido; CANCELLED/NO_SHOW NO bloquean. 409. Check+insert en $transaction.
- Estados terminales (COMPLETED/CANCELLED/NO_SHOW) no editables ni cancelables → 409. clientId inmutable en PATCH.
- PATCH de solo-hora no revalida isActive del servicio ya vinculado (intencional, anotado en código).

**Verificación (server real + curl + psql).** Todos los casos: 400 fecha sin offset / pasado / client ajeno / service ajeno-inactivo-borrado; 201 con endsAt=+30min/CONFIRMED/MANUAL; 409 solapamiento (adyacente permitido); CANCELLED/NO_SHOW no bloquean; 409 terminal; PATCH recalcula endsAt; from/to filtran; aislamiento A↔B 404; 401 sin token. En BD: 4 citas negocio A, endsAt correcto, source MANUAL, createdById presente. lint/typecheck/build OK. Data limpiada.

**Commit.** `feat(api): add Appointments module (CRUD, cancel, no-show, overlap & tenancy validation)`

**Deuda generada.** Race teórica de solapamiento (check+insert en transacción pero sin constraint exclusión Postgres btree_gist; si se vuelve real, migración). AuditLog de citas. startsAt offset-obligatorio (camino a Business.timezone cuando llegue hora local).

### 2026-06-16 — Services: CRUD + activar/desactivar + soft delete

**Qué se hizo.** Segundo recurso H1. ServicesModule (5 endpoints), patrón multi-tenant calcado de Clients. CRUD + toggle isActive (desactivar) + soft delete, filtrado por @BusinessId().

**Decisiones clave.**
- DELETE = soft delete (deletedAt); desactivar = PATCH {isActive:false}; includeInactive muestra activos+inactivos pero nunca borrados.
- basePrice serializado como Number() en la respuesta. CONVENCIÓN MONETARIA (regla de oro): el dinero se calcula SIEMPRE en backend con Decimal; el number de la API es solo display, jamás para recalcular. Anotada en código y aquí. Clave para Payments.
- Listado simple sin paginación (catálogo pequeño), orden por name asc.
- includeInactive con @Transform (los query params llegan como string).

**Verificación (server real + curl + psql).** basePrice typeof number (45.5) / Decimal 45.50 en BD; validaciones -1/0/3-decimales → 400; aislamiento A↔B → 404; includeInactive oculta/muestra; DELETE 204 + deletedAt. lint/typecheck/build OK. Data limpiada.

**Commit.** `feat(api): add Services module (CRUD, activate/deactivate, soft delete)`

**Deuda generada.** AuditLog de servicios; bloqueo de soft-delete de servicio con citas (cuando exista Appointments).

### 2026-06-14 — Clients: CRUD + VIP + soft delete + búsqueda

**Qué se hizo.** Primer recurso operativo de H1. ClientsModule con 6 endpoints (list con search/paginación, create, getOne, update, updateVip, soft delete), todos bajo JwtAuthGuard y filtrados por @BusinessId() (nuevo decorator: currentBusiness null → 403). Primer uso real del multi-tenancy con código.

**Decisiones clave.**
- Multi-tenancy en cada operación: findFirst/updateMany siempre con {id, businessId, deletedAt:null}; count===0 → 404 genérico (no revela existencia en otro negocio).
- Teléfono duplicado activo: captura P2002 → 409 (sin pre-check, evita race). Reutilizable tras soft delete (índice parcial).
- Tags triviales (VIP/NEW) ahora; ficha enriquecida diferida (depende de Appointments/Payments).
- Nuevo decorator @BusinessId() reutilizable por todos los recursos H1.

**Desviación.** Hubo que exportar JwtModule desde AuthModule (no bastaba exportar el guard) para que JwtService se inyecte en ClientsModule. Cambio mínimo en Auth, necesario para reutilizar el guard en recursos H1.

**Verificación (server real + curl + psql).** AISLAMIENTO A↔B confirmado: B → 404 en GET/PATCH/DELETE de cliente de A; listado de B vacío. CRUD completo, 401 sin token, 403 admin sin negocio, 409 teléfono duplicado, 204 soft delete + recrear, VIP 0–100 (150 → 400), ParseUUIDPipe acepta v7. lint/typecheck/build OK. Data limpiada.

**Commit.** `feat(api): add Clients module (CRUD, VIP, soft delete, search)`

**Deuda generada.** Ficha enriquecida de cliente (stats/historial/tags por actividad) hasta Appointments/Payments; AuditLog de clientes; RolesGuard (necesario cuando exista gestión de staff).

### 2026-06-14 — Auth-3: JwtAuthGuard + currentUser/currentBusiness + me/refresh/logout

**Qué se hizo.** Cerrado el núcleo del bloque Auth. JwtAuthGuard propio (sin passport) que verifica el access JWT, carga el User en BD (rechaza si !isActive/deletedAt) y resuelve currentUser {id,email,globalRole} + currentBusiness {id,name,role}|null desde BusinessMember. Decorators @CurrentUser()/@CurrentBusiness(). Endpoints GET /me (protegido), POST /refresh (rotación + detección de reuso), POST /logout (idempotente, 204).

**Decisiones clave.**
- Guard valida en BD, no solo claims (token vivo no sirve si el usuario se desactiva).
- currentBusiness = única membresía activa, null si no hay (ej. ONPILOT_ADMIN). Sin cambio de negocio (MVP).
- Refresh: rotación atómica (updateMany where {id, revokedAt:null} + count===1 en transacción, a prueba de race). Detección de reuso: un refresh revocado reenviado → revoca TODA la familia del usuario + 401.
- 401 genérico uniforme en todos los fallos de refresh (no distingue no-existe/expirado/revocado).
- logout sin guard (permite cerrar sesión con access caducado), idempotente, 204.
- currentUser mínimo sin passwordHash. me hace query ligera extra solo para el name (no hot path).
- Guard exportado del AuthModule → reutilizable por los módulos H1.

**Verificación (server real + curl + psql).** /me sin token → 401, con token → user+activeBusiness; refresh rota (R1 revokedAt en BD, R2 activo); reuso de R1 revocado → 401 + active=0 (familia revocada); logout → 204 + revokedAt; refresh tras logout → 401; logout repetido → 204; refresh sin body → 400. lint/typecheck/build OK. Data de prueba limpiada.

**Commit.** `feat(api): add JwtAuthGuard and auth session endpoints (me, refresh, logout)`

**Cierre de bloque.** Bloque Auth (Auth-1/2/3) COMPLETO: registro, login, hash Argon2, JWT access + refresh opaco rotativo/revocable, guard y resolución de tenant. Deudas del bloque aún abiertas: rate limiting (@nestjs/throttler) y AuditLog de login/logout. Autorización por rol + comprobación de herramienta activa llegarán con los recursos H1.

### 2026-06-14 — Auth-2: AuthModule core (config, register-business, login)

**Qué se hizo.** Introducido @nestjs/config (ConfigModule global + validate que corta el arranque si falta un secret). Implementados POST /api/auth/register-business (transaccional) y POST /api/auth/login, con hash Argon2id de password y emisión de access JWT + refresh token opaco persistido hasheado. Prefijo global /api y ValidationPipe (whitelist) en main.ts.

**Decisiones clave.**
- Refresh token: string opaco aleatorio (crypto.randomBytes 32), NO JWT; se persiste su SHA-256 en RefreshToken.tokenHash (determinista, para lookup en Auth-3). Argon2 solo para passwords. Sin REFRESH_TOKEN_SECRET (no se firma nada).
- Access token: claims mínimos (sub, email, globalRole), sin businessId (se resolverá en el guard de Auth-3).
- register-business: hash fuera de la transacción; $transaction crea User+Business+BusinessMember(BUSINESS_OWNER); businessId asignado por backend; email duplicado (P2002) → 409.
- login: error genérico "Invalid credentials" (no revela si falla email o password); solo usuarios isActive.
- Password @MinLength(10), sin reglas de complejidad. ValidationPipe whitelist:true como defensa anti-businessId colado.
- ConfigModule sustituye dotenv/config en runtime; prisma.config.ts mantiene dotenv para la CLI.

**Verificación (server real + curl + psql).** register → 201 + tokens; login correcto → 200 + businesses[]; login incorrecto → 401 genérico; email duplicado → 409. En BD: passwordHash = $argon2id$…; RefreshToken con tokenHash SHA-256 ≠ token en claro. Arranque conecta a Postgres sin P1012 tras quitar dotenv/config. lint/typecheck/build OK.

**Desviaciones (todas necesarias).** (1) argon2 es módulo nativo → habilitado en pnpm-workspace.yaml allowBuilds. (2) Cliente Prisma no se había regenerado tras Auth-1 → prisma:generate para materializar el delegate refreshToken. (3) Cast de expiresIn a JwtSignOptions['expiresIn']. (4) Reconciliado .env.example (nombres nuevos, eliminado REFRESH_TOKEN_SECRET).

**Commit.** `feat(api): add ConfigModule and Auth core (register-business, login)`

**Pendiente / próximo.** Auth-3: JwtAuthGuard + resolución currentUser/currentBusiness + endpoints me/refresh/logout. Deuda del bloque aún abierta: rate limiting, AuditLog de login/logout.

### 2026-06-14 — Tarea 6 (Auth-1): Modelo RefreshToken + migración

**Qué se hizo.** Añadido el modelo RefreshToken al schema (userId, tokenHash @unique, expiresAt, revokedAt, createdAt; back-relation en User) y su migración add_refresh_token (aditiva, sin SQL manual).
**Decisiones clave.** onDelete: Cascade (desviación justificada de Restrict: el refresh token es artefacto de sesión, no dato de negocio; trazabilidad en AuditLog). Sin businessId (el token es del usuario, no del negocio). Sin deletedAt (el borrado lógico es revokedAt). tokenHash @unique = índice de lookup.
**Verificación.** migration.sql revisado: solo crea RefreshToken + índices + FK, no toca tablas H1. validate / migrate status / typecheck OK.
**Commit.** `feat(api): add RefreshToken model and migration`
**Pendiente / próximo.** Auth-2 introducirá @nestjs/config + Argon2 + emisión JWT (access+refresh). Deuda del bloque Auth: rate limiting (@nestjs/throttler) y AuditLog de login/logout, ambos diferidos.

### 2026-06-13 — Tarea 5: Regla de devlog en CLAUDE.md

**Qué se hizo.** Añadida sección "Devlog" a CLAUDE.md (leer docs/devlog.md al empezar tarea, actualizarlo al cerrar). Eliminada la sección "Estado actual", obsoleta y duplicada con el devlog.
**Decisiones clave.** El "dónde estamos" vive solo en el devlog; CLAUDE.md se queda con lo permanente (reglas, stack, decisiones cerradas). Evita desincronización.
**Verificación.** Diff revisado: solo CLAUDE.md, borra Estado actual y añade Devlog.
**Commit.** `docs: track project state in devlog, drop stale Estado actual`
**Deuda generada.** Ninguna.

### 2026-06-13 — Tarea 4: PrismaModule + PrismaService

**Qué se hizo.** Integración NestJS↔Prisma: PrismaService (extiende PrismaClient, $connect/$disconnect en ciclo de vida) y PrismaModule @Global. Registrado en AppModule. enableShutdownHooks() en main.ts.
**Decisiones / hallazgos clave.**
- Prisma 7 emite ESM por defecto con el generador `prisma-client`; resuelto con `moduleFormat = "cjs"` en el bloque generator (NO migrar API a ESM, NO generador legacy).
- HALLAZGO: Prisma 7 NO conecta a Postgres solo con `url` en el datasource (da P1012). Requiere driver adapter. Conexión directa = @prisma/adapter-pg + pg. El datasource queda pelado (solo provider); la URL de CLI la da prisma.config.ts.
- Runtime: `import 'dotenv/config'` como 1ª línea de main.ts puebla process.env.DATABASE_URL que consume el adapter. (No se usó @nestjs/config: se deja para cuando haya más config.)
**Dependencias añadidas.** @prisma/adapter-pg@7.8.0, pg@^8.21.0, @types/pg (dev). Justificadas: único mecanismo de conexión directa en Prisma 7, oficiales de Prisma.
**Verificación.** typecheck/lint/build OK; pnpm dev:api arranca SIN exportar env y conecta; curl :4000 → 200 Hello World; cliente confirmado CommonJS.
**Commit.** `feat(api): add PrismaModule and PrismaService`
**Deuda generada.** Pendiente futuro: @nestjs/config cuando haya más configuración (JWT, etc.) que gestionar.

### 2026-06-13 — Tarea 3: Scripts de Prisma + nota CLAUDE.md

**Qué se hizo.** Añadidos los scripts `prisma:migrate` (→ `prisma migrate dev`) y `prisma:format` al package.json raíz, siguiendo el patrón de los existentes. Actualizado CLAUDE.md (lista de CHECK + nota de migraciones; eliminada la línea de "pendiente" obsoleta).
**Decisiones clave.** `prisma:deploy` queda fuera (no hay entorno remoto). `--name` se reenvía por pnpm al invocar.
**Verificación.** JSON válido; `prisma:format` OK sin tocar el schema; `prisma:migrate --help` resuelve correcto sin aplicar.
**Commit.** `chore: add prisma:migrate and prisma:format scripts`
**Deuda generada.** Ninguna. (Cierra deuda previa.)

### 2026-06-13 — Tarea 2: Migración inicial H1 (`init_h1`)

**Qué se hizo.** Primera migración del proyecto, generada desde el schema H1 ya
comiteado y aplicada a la Postgres local (`onpilot_dev`). Materializa 8 tablas, 7
enums, FKs `onDelete: RESTRICT` e índices del schema, más un bloque SQL manual al
final con el índice único parcial de teléfono y 8 CHECK de rango.

**Decisiones clave.**
- Método `prisma migrate dev --create-only` → edición manual del `migration.sql` →
  aplicación. Una sola migración.
- Pausa de verificación entre generar y editar: se confirmaron los nombres reales de
  tablas/columnas (PascalCase/camelCase entrecomillados) antes de escribir el SQL manual.
- Índice parcial: `Client_businessId_phone_active_idx`, `UNIQUE ("businessId","phone")
  WHERE "deletedAt" IS NULL` → teléfono único por negocio solo entre clientes activos.
- 8 CHECK vía `ALTER TABLE`: `vipDiscountPercent` 0–100; `Service.basePrice >= 0`;
  `Service.durationMinutes > 0`; los 4 importes de `Payment >= 0`;
  `Appointment.startsAt < endsAt` (estricto).
- "No citas en pasado" NO se modela como CHECK (depende de `now()` + timezone del
  negocio): queda en capa de aplicación.
- `schema.prisma` intacto.

**Verificación.** `migrate status` → up to date; `prisma:validate` y `prisma:generate`
OK. Pruebas funcionales en psql (transacción con ROLLBACK, sin persistir): el índice
parcial bloquea el duplicado activo, permite reutilizar el teléfono tras soft-delete,
y los CHECK rechazan los valores fuera de rango. Los `Payment_*_nonneg` no se probaron
con INSERT explícito por ser idénticos en forma al de `Service.basePrice` (sí verificado);
existen en la migración aplicada.

**Commit.** `feat(api): add initial H1 migration (init_h1)`

**Deuda generada.** Índice redundante de teléfono; scripts `prisma:migrate`/`prisma:format`;
invariantes manuales invisibles a Prisma. Detectada además la inconsistencia del paso
REVISIÓN entre docs. (Ver sección de deuda arriba.)

---

### 2026-06-13 — Tarea 1: Schema Prisma H1

**Qué se hizo.** Definición del schema Prisma de las 8 entidades de Fase 1 (H1) en
`apps/api/prisma/schema.prisma`: `User`, `Business`, `BusinessMember`, `Client`,
`Service`, `Appointment`, `Payment`, `AuditLog`, con sus 7 enums, relaciones, índices
y convenciones multi-tenant. Sin migración (diferida a la Tarea 2).

**Decisiones clave.**
- IDs `uuid(7)` con `@db.Uuid`; fechas en UTC; soft delete (`deletedAt`) solo donde
  corresponde (NO en `BusinessMember` ni en `Payment`).
- Dinero en `Decimal(10,2)`; `vipDiscountPercent` como `Int`.
- `Appointment.status` `@default(CONFIRMED)`; `source` `@default(MANUAL)`.
- `Payment.appointmentId` nullable y `@unique` → un cobro principal por cita.
- `Business.timezone` `@default("Europe/Madrid")`.
- Relaciones con `onDelete: Restrict`; `@@unique([businessId, userId])` en
  `BusinessMember`; índices compuestos con `businessId` por delante.
- Nullables confirmados: `Appointment.createdById`, `Payment.paidAt`,
  `Business.city/phone/email`, `AuditLog.userId/businessId`.
- Sin `deletedBy` (no inventar campos; el "quién" lo cubre `AuditLog`).
- Contradicción resuelta: la spec de H1 menciona `ClientNote`, pero manda `CLAUDE.md`
  / `05-database-model.md` → notas simples en `Client`, sin entidad `ClientNote`. Y se
  usa `BusinessMember` (que la spec de H1 no mencionaba).
- Fuera de alcance por decisión: `ToolSubscription` + enum `Tool` (fases posteriores);
  tabla de refresh tokens (irá con el módulo Auth).

**Verificación.** `prisma:validate` y `prisma:generate` OK. `uuid(7)` validó sin
problema en Prisma 7.8. No hizo falta tocar el `datasource url`: `prisma.config.ts` ya
gestiona la conexión.

**Commit.** `feat(api): add H1 Prisma schema (8 entities + enums)` (`3826fcb`)

**Deuda generada.** Diferidos a la Tarea 2 (ya resueltos): índice único parcial de
teléfono y CHECK de rango.

---

### 2026-06-13 — Tarea 0: Harness de Claude Code

**Qué se hizo.** Montaje del entorno de trabajo asistido por IA: `CLAUDE.md` en la raíz
(reglas permanentes, stack, multi-tenancy, prohibiciones, decisiones cerradas de H1) y
slash commands en `.claude/commands/` (`/spec`, `/plan`, `/implement`, `/check`,
`/review`) que materializan el flujo SPEC → PLAN → APROBACIÓN → IMPLEMENTACIÓN → CHECK →
REVISIÓN → COMMIT. Los comandos llevan `disable-model-invocation: true` para que solo se
disparen manualmente.

**Commit.** `chore: add Claude Code harness (CLAUDE.md + workflow commands)`

---

> **Plantilla para nuevos asientos** (copiar arriba del todo, bajo "## Asientos"):
>
> ```
> ### AAAA-MM-DD — Tarea N: <título>
>
> **Qué se hizo.** …
> **Decisiones clave.** …
> **Verificación.** …
> **Commit.** …
> **Deuda generada.** … (y añadir a la sección de deuda de arriba)
> ```