---
description: Ejecutar los checks reales del monorepo (lint, typecheck, build, prisma) y reportar resultados honestos
argument-hint: [subset opcional: lint | typecheck | build | prisma]
allowed-tools: Bash(pnpm lint:*), Bash(pnpm typecheck:*), Bash(pnpm build:*), Bash(pnpm prisma:validate:*), Bash(pnpm prisma:generate:*), Bash(pnpm --filter api exec prisma:*), Read
disable-model-invocation: true
---

# CHECK

Paso **CHECK** del flujo de Onpilot. Ejecuta los comandos de verificación **de verdad** y reporta su salida real. No inventes resultados ni asumas que pasan.

Si `$ARGUMENTS` indica un subconjunto, ejecuta solo esos; si está vacío, ejecuta los que correspondan a lo implementado.

Comandos disponibles (scripts reales del repo):

```bash
pnpm prisma:validate
pnpm prisma:generate
pnpm lint
pnpm typecheck
pnpm build
```

Para cambios de schema que requieran migración (solo si el plan lo aprobó):

```bash
pnpm --filter api exec prisma migrate dev --name <nombre>
```

Para cada comando ejecutado, reporta:

```
Comando:
Resultado: OK / FALLO
Salida relevante (errores o warnings, recortados):
```

Si algo falla, propón el arreglo mínimo pero **no lo apliques sin confirmación** salvo que sea trivial y dentro del alcance ya aprobado. Cuando todo pase, indica que se puede pasar a `/review`.
