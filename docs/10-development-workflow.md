# Onpilot — Development Workflow

## Objetivo

Este documento define cómo se debe desarrollar Onpilot.

El objetivo es trabajar con Spec-Driven Development y Harness Engineering para evitar caos, sobreingeniería y código generado sin control.

---

## Principio principal

> Ninguna feature importante se implementa sin spec previa.

Antes de programar, debe existir una definición clara de:

- Qué se va a construir.
- Qué entidades toca.
- Qué reglas de negocio aplica.
- Qué endpoints necesita.
- Qué validaciones tiene.
- Qué riesgos de seguridad existen.
- Cómo se valida que funciona.

---

## Flujo obligatorio

Cada tarea debe seguir este flujo:

```txt
SPEC → PLAN → APROBACIÓN → IMPLEMENTACIÓN → CHECK → REVISIÓN → COMMIT
```

---

## 1. SPEC

Antes de implementar, revisar los documentos relevantes.

Para cualquier tarea de H1:

- `docs/00-project-brief.md`
- `docs/02-roadmap.md`
- `docs/04-tech-stack.md`
- `docs/07-multi-tenancy-rules.md`
- `docs/08-security-rules.md`
- `docs/features/h1-agenda-clientes.md`
- `docs/05-database-model.md`
- `docs/06-api-contracts.md`

Para tareas de IA o WhatsApp:

- `docs/09-ai-bot-rules.md`
- `docs/features/h2-whatsapp-automatico.md`

---

## 2. PLAN

Antes de tocar código, la IA o el desarrollador debe indicar:

- Qué va a hacer.
- Qué archivos va a crear.
- Qué archivos va a modificar.
- Qué decisiones técnicas está tomando.
- Qué comandos habrá que ejecutar.

Ejemplo:

```txt
Voy a implementar el módulo Clients en backend.

Archivos a crear:
- apps/api/src/clients/clients.module.ts
- apps/api/src/clients/clients.controller.ts
- apps/api/src/clients/clients.service.ts
- apps/api/src/clients/dto/create-client.dto.ts
- apps/api/src/clients/dto/update-client.dto.ts

Archivos a modificar:
- apps/api/src/app.module.ts
- apps/api/prisma/schema.prisma
```

Si el plan toca demasiados archivos o incluye cosas fuera de la fase actual, debe rechazarse.

---

## 3. APROBACIÓN

El plan no se implementa hasta recibir aprobación explícita.

- Ningún código se escribe antes de entregar el PLAN y recibir el visto bueno.
- La aprobación es una frase inequívoca del tipo "Plan aprobado. Implementa
  únicamente lo descrito".
- Si el alcance cambia durante la aprobación, se vuelve a confirmar antes de seguir.

---

## 4. IMPLEMENTACIÓN

La implementación debe ser pequeña y controlada.

Reglas:

- No implementar varias features grandes a la vez.
- No tocar archivos no relacionados.
- No introducir dependencias sin justificar.
- No saltarse el roadmap.
- No implementar WhatsApp antes de H1.
- No implementar Stripe antes de validar MVP.
- No implementar redes antes de H4.
- No cambiar arquitectura sin documentarlo.

---

## 5. CHECK

Después de implementar, ejecutar checks.

Comandos previstos:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm prisma validate
```

Al inicio puede que algunos comandos no existan todavía. Se irán añadiendo progresivamente.

Para backend:

```bash
pnpm --filter api lint
pnpm --filter api test
pnpm --filter api build
```

Para frontend:

```bash
pnpm --filter web lint
pnpm --filter web build
```

Para Prisma:

```bash
pnpm --filter api prisma validate
pnpm --filter api prisma migrate dev
```

---

## 6. REVISIÓN

Antes del commit, revisar el resultado.

- Repasar el diff completo: solo los archivos aprobados, sin alcance de más.
- Confirmar que los checks se ejecutaron de verdad (no darlos por pasados).
- Comprobar multi-tenancy, seguridad y que no se exponen datos sensibles.
- Actualizar el devlog (`docs/devlog.md`) y la sección de deuda técnica abierta.

---

## 7. COMMIT

Cada bloque funcional terminado debe tener un commit claro.

Formato recomendado:

```txt
type(scope): description
```

Ejemplos:

```txt
docs: add h1 feature spec
feat(api): add clients module
feat(web): add clients page
fix(api): validate appointment overlap
refactor(api): move tenant guard
chore: configure docker compose
```

---

## Ramas

Durante el MVP se puede trabajar en `main` si el proyecto lo lleva una sola persona.

Cuando haya más estabilidad, usar ramas:

```txt
feature/h1-clients
feature/h1-appointments
feature/auth
fix/payment-calculation
```

---

## Uso de IA

La IA debe actuar como copiloto, no como dueña del proyecto.

Reglas para IA:

- Leer docs antes de implementar.
- No inventar requisitos.
- No saltarse fases.
- Preguntar si falta información.
- Proponer plan antes de tocar código.
- Mantener cambios pequeños.
- Respetar multi-tenancy.
- Respetar seguridad.
- No introducir dependencias innecesarias.
- No crear abstracciones prematuras.
- No eliminar código sin explicar por qué.

---

## Checklist antes de aceptar código

Antes de aceptar una implementación:

- ¿Respeta la spec?
- ¿Respeta el roadmap?
- ¿Respeta `businessId`?
- ¿Valida inputs?
- ¿Tiene errores controlados?
- ¿No expone datos sensibles?
- ¿No toca archivos innecesarios?
- ¿Compila?
- ¿Pasan los checks disponibles?
- ¿El commit es claro?

---

## Regla final

Si una tarea no puede explicarse claramente en una spec o en un plan, no está lista para implementarse.
