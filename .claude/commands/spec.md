---
description: Leer los docs relevantes de una tarea y resumir el contrato (objetivo, alcance, reglas, entidades, criterios)
argument-hint: <tema o feature, p.ej. "schema H1" o "endpoint crear cliente">
allowed-tools: Read, Glob, Grep
disable-model-invocation: true
---

# SPEC — $ARGUMENTS

Trabajamos sobre Onpilot siguiendo el flujo SPEC → PLAN → APROBACIÓN → IMPLEMENTACIÓN → CHECK → REVISIÓN → COMMIT (ver `CLAUDE.md`).

Este es el paso **SPEC**. No escribas código. No propongas todavía un plan. Solo lee y sintetiza.

Tarea: **$ARGUMENTS**

1. Identifica qué documentos de `docs/` son relevantes para esta tarea y **léelos de verdad** (no asumas su contenido). Como mínimo revisa los que apliquen de: `docs/00-project-brief.md`, `docs/02-roadmap.md`, `docs/04-tech-stack.md`, `docs/05-database-model.md`, `docs/06-api-contracts.md`, `docs/07-multi-tenancy-rules.md`, `docs/08-security-rules.md`, `docs/10-development-workflow.md` y la spec de feature correspondiente en `docs/features/`.
2. Si un documento que necesitas no existe o no es legible, dilo explícitamente. No finjas haberlo leído.

Después entrega un resumen con esta estructura:

```
Documentos leídos:
Objetivo:
Alcance (qué entra):
Fuera de alcance (qué NO entra):
Entidades / recursos implicados:
Reglas de negocio relevantes:
Restricciones de multi-tenancy:
Restricciones de seguridad / datos sensibles:
Criterios de aceptación:
Contradicciones o ambigüedades detectadas entre documentos:
Decisiones que necesito que confirmes antes del PLAN:
```

Termina preguntando si pasamos al PLAN (`/plan`).
