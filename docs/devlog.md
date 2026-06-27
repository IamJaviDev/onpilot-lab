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

- [ ] **Índice redundante de teléfono.** `Client_businessId_phone_idx` (no único,
  autogenerado del schema) está solapado por el parcial único
  `Client_businessId_phone_active_idx`. Eliminar el no-único en una futura tarea que
  toque el schema. _(Generado en Tarea 2.)_
- [x] **Scripts de Prisma pendientes.** Añadir `prisma:migrate` y `prisma:format` al
  `package.json` raíz. Microtarea con su propio commit. _(Generado en Tarea 2. Cerrado en Tarea 3.)_
- [ ] **Inconsistencia entre docs.** `docs/10-development-workflow.md` lista el flujo
  sin el paso REVISIÓN, mientras `CLAUDE.md` sí lo incluye. Alinear ambos
  (manda `CLAUDE.md`). Microtarea de documentación. _(Detectado en Tarea 2.)_
- [x] **ConfigModule pendiente.** Migrar de `import 'dotenv/config'` a `@nestjs/config`
  (ConfigModule) cuando haya más configuración que gestionar. _(Generado en Tarea 4. Cerrado en Auth-2.)_
- [ ] **Rate limiting en Auth.** 08-security-rules.md pide throttling en login/registro.
  Diferido a una tarea con @nestjs/throttler. _(Generado en Auth-1.)_
- [ ] **AuditLog transversal.** Auditar acciones según 08-security: login/logout
  _(Auth-1)_, create/edit/VIP/delete de clientes _(Clients)_, create/edit de servicios
  _(Services)_, create/edit/cancel/no-show de citas _(Appointments)_, create y mark-error
  de cobros _(Payments)_. Se difiere todo a una única tarea de auditoría transversal; al
  hacerla se cierran todas de golpe.
- [ ] **RolesGuard pendiente.** Autorización por rol (owner vs staff). Necesario cuando
  exista gestión de staff; hoy solo hay owners. _(Generado en Clients.)_
- [ ] **Ficha enriquecida de cliente.** Stats (totalVisits, totalSpent, lastVisit),
  historial de citas/cobros y tags por actividad (REACTIVATE/REGULAR). Ya existen
  Appointments y Payments → plenamente accionable. _(Generado en Clients.)_
- [ ] **Bloqueo de soft-delete de servicio con citas.** No permitir borrar un servicio
  que tenga citas asociadas. Ya existe Appointments → accionable. _(Generado en Services.)_
- [ ] **Race teórica de solapamiento de citas.** El check+insert va en `$transaction`
  pero sin constraint de exclusión de Postgres (btree_gist). Para MVP es teórica; si se
  vuelve real, añadir el constraint vía migración SQL. _(Generado en Appointments.)_
- [ ] **Cobro de importe libre sin servicio.** No soportado en MVP: todo cobro exige un
  servicio (de la cita o explícito) como origen del basePrice. Si se necesita cobrar un
  importe arbitrario sin servicio, decisión de producto futura. _(Generado en Payments.)_

## Convenciones / Notas permanentes

No son deuda (no se cierran); son recordatorios vivos del proyecto.

- **Invariantes invisibles a Prisma.** El índice único parcial de teléfono y los 8 CHECK
  de rango viven solo en el SQL de la migración; Prisma no los introspecta (`prisma db pull`
  y el diff de `migrate dev` no los ven). Cualquier cambio sobre ellos se edita a mano en
  una nueva migración. **No declarar en `schema.prisma`.** _(Tarea 2.)_
- **Convención monetaria (regla de oro).** El dinero se calcula SIEMPRE en backend con
  Decimal; el `number` que sale en las respuestas de la API es solo para display, jamás
  para recalcular. _(Services.)_

## Asientos

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