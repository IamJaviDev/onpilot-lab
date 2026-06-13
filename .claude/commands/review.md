---
description: Resumen final de la tarea (formato obligatorio) y commit SUGERIDO. No comitea.
argument-hint: [notas para el resumen]
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Read
disable-model-invocation: true
---

# REVISIÓN

Paso **REVISIÓN** del flujo de Onpilot. Puedes mirar `git status` y `git diff` para resumir con precisión lo que realmente cambió.

Notas adicionales: **$ARGUMENTS**

Entrega el resumen con esta estructura exacta:

```
Resumen de implementación:

Archivos creados:

Archivos modificados:

Decisiones tomadas:

Cambios respecto al plan:

Cómo probarlo:

Checks ejecutados:

Resultado de los checks:

Riesgos pendientes:

Trabajo pendiente:

Commit sugerido:
```

Reglas:
- El "Commit sugerido" es una **propuesta** (mensaje en estilo Conventional Commits). **No ejecutes `git commit`.** Solo lo haré yo, o tú únicamente si te lo pido de forma expresa.
- Sé honesto en "Checks ejecutados" y "Resultado de los checks": solo lo que se haya corrido de verdad en `/check`.
- En "Riesgos pendientes" incluye cualquier deuda de multi-tenancy o seguridad que quede abierta.
