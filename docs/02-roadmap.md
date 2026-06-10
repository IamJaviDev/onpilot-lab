# Onpilot — Roadmap de desarrollo

## Principio general

Onpilot se desarrollará por fases.

No se debe construir todo a la vez.

El orden correcto es:

1. Base documental y arquitectura.
2. MVP H1 Agenda y clientes.
3. H2 WhatsApp automático.
4. H5 Panel de control real.
5. H4 Contenido para redes.
6. Pagos y backoffice avanzado.
7. Optimización y escala.

## Fase 0 — Spec, arquitectura y setup

Objetivo:

Crear una base sólida antes de programar.

Incluye:

- Documentación base del producto.
- Roadmap.
- Tech stack.
- Reglas multi-tenant.
- Reglas de seguridad.
- Specs de features.
- Modelo inicial de datos.
- Contratos API iniciales.
- Prompts de trabajo para IA.
- Monorepo.
- Frontend Next.js.
- Backend NestJS.
- Docker Compose con PostgreSQL y Redis.
- Prisma.

Resultado:

El proyecto queda preparado para desarrollar de forma ordenada.

## Fase 1 — MVP H1 Agenda y clientes

Objetivo:

Construir la primera herramienta real y útil del sistema.

Incluye:

- Registro/login.
- Negocios.
- Usuarios.
- Roles básicos.
- Clientes.
- Servicios.
- Citas.
- Cobros.
- Ficha de cliente.
- Cierre de caja básico.
- Dashboard básico con KPIs reales.
- Multi-tenancy básico.
- API interna documentada.

Resultado:

Un negocio puede usar Onpilot como agenda y gestor de clientes real.

Esta fase debe poder enseñarse a primeros usuarios beta.

## Fase 2 — H2 WhatsApp automático

Objetivo:

Construir el core diferenciador de Onpilot.

Incluye:

- Configuración del bot por negocio.
- WhatsApp Cloud API.
- Webhook de entrada.
- Envío de mensajes.
- Bandeja de conversaciones.
- Claude Haiku.
- Prompt dinámico por negocio.
- Consulta de disponibilidad.
- Crear cita desde WhatsApp.
- Cancelar cita desde WhatsApp.
- Confirmar cita.
- Recordatorios automáticos con BullMQ.
- Escalado a humano.
- Motor de reactivación.

Resultado:

Onpilot empieza a funcionar como piloto automático real.

## Fase 3 — H5 Panel de control

Objetivo:

Convertir los datos de H1 y H2 en inteligencia de negocio.

Incluye:

- KPIs reales.
- Comparativas por período.
- Facturación.
- Ticket medio.
- Clientes nuevos.
- Clientes recurrentes.
- Retención.
- Top servicios.
- Citas canceladas.
- Métricas del bot.
- Alertas automáticas.

Resultado:

El profesional entiende mejor su negocio y recibe avisos útiles.

## Fase 4 — H4 Contenido para redes

Objetivo:

Añadir generación y publicación de contenido multicanal.

Incluye:

- Generación de captions con Claude Sonnet.
- Ideas de contenido por sector.
- Calendario de publicaciones.
- Programación de posts.
- Publicación con Zernio.
- Instagram.
- Facebook.
- TikTok.
- Estados de WhatsApp.
- Métricas básicas.

Resultado:

Onpilot se convierte en una suite más completa y aumenta el ticket medio.

## Fase 5 — Backoffice y facturación

Objetivo:

Permitir al equipo Onpilot gestionar clientes SaaS y suscripciones.

Incluye:

- Backoffice interno.
- Gestión de clientes SaaS.
- Activar/desactivar H1, H2, H4 y H5.
- MRR.
- Churn.
- Estado de onboarding.
- Conectores.
- Calidad del bot.
- Soporte.
- Stripe.
- Plan mensual.
- Plan anual.

Resultado:

Onpilot puede operar como negocio SaaS real.

## Fase 6 — Escala y optimización

Objetivo:

Mejorar costes, rendimiento y mantenibilidad.

Incluye:

- Optimización de queries.
- Prompt caching.
- Mejoras de seguridad.
- Auditoría.
- Migración parcial o total de Zernio a APIs directas.
- App Reviews avanzados.
- Mejoras de observabilidad.
- Tests avanzados.
- CI/CD.

Resultado:

El sistema queda preparado para crecer con más clientes.

## Reglas del roadmap

- No implementar WhatsApp antes de tener H1 funcional.
- No implementar Stripe antes de validar el MVP.
- No implementar redes sociales antes de tener datos reales y usuarios beta.
- No añadir complejidad innecesaria en Fase 1.
- Cada fase debe terminar con commit estable.
- Cada feature debe tener spec antes de implementarse.
- Cada implementación debe respetar multi-tenancy desde el inicio.