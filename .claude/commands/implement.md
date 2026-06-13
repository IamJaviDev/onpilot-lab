---
description: Implementar ÚNICAMENTE el plan ya aprobado. No amplía alcance, no comitea.
argument-hint: [matices o aclaraciones sobre el plan aprobado]
allowed-tools: Read, Glob, Grep, Edit, Write
disable-model-invocation: true
---

# IMPLEMENTACIÓN

Paso **IMPLEMENTACIÓN** del flujo de Onpilot. Implementa **solo lo descrito en el plan que ya he aprobado** en esta conversación.

Aclaraciones para esta implementación (si las hay): **$ARGUMENTS**

Reglas estrictas:
- Toca **solo los archivos listados en el plan aprobado**.
- No amplíes el alcance. No añadas mejoras, features futuras ni refactors no solicitados.
- No añadas dependencias salvo que estuvieran en el plan aprobado.
- Respeta TypeScript estricto, Prisma 7, PostgreSQL, y las reglas de multi-tenancy y seguridad de `CLAUDE.md`.
- Código claro y simple, sin sobreingeniería.
- Si durante la implementación detectas que necesitas desviarte del plan (otro archivo, otra decisión), **párate y explícamelo antes de hacerlo** en lugar de improvisar.
- **No ejecutes `git commit`.** Eso se decide en `/review`.
- No afirmes que algo funciona sin haberlo verificado.

Al terminar, indica que se debe ejecutar `/check`.
