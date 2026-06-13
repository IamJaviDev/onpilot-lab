---
description: Entregar el PLAN de la tarea en el formato obligatorio. NO escribe código; espera aprobación.
argument-hint: <tarea a planificar>
allowed-tools: Read, Glob, Grep
disable-model-invocation: true
---

# PLAN — $ARGUMENTS

Paso **PLAN** del flujo de Onpilot. **No escribas código todavía. No crees ni modifiques archivos.** Solo planifica y espera mi aprobación explícita.

Si aún no has hecho el SPEC de esta tarea, léete antes los docs relevantes de `docs/` (no asumas su contenido).

Tarea: **$ARGUMENTS**

Entrega el plan exactamente con esta estructura:

```
Objetivo:

Alcance:

Documentos revisados:

Archivos que se crearían:

Archivos que se modificarían:

Entidades implicadas:

Relaciones implicadas:

Enums implicados:

Decisiones técnicas:

Validaciones:

Riesgos de multi-tenancy:

Riesgos de seguridad:

Posibles conflictos con la documentación:

Comandos de validación:

Resultado esperado:
```

Reglas:
- Mantén el alcance mínimo. Si crees imprescindible tocar un archivo fuera de lo obvio, justifícalo aquí.
- No añadas features futuras ni abstracciones que la tarea no pida (ver prohibiciones en `CLAUDE.md`).
- Marca claramente cualquier punto que dependa de una decisión mía.

Termina con: "Esperando aprobación. Responde `/implement` (o «Plan aprobado, implementa únicamente lo descrito») para continuar."
