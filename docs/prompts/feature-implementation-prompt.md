# Onpilot — Feature Implementation Prompt

Usa este prompt cada vez que vayas a pedir a una IA que implemente una feature concreta.

---

## Prompt

Estoy trabajando en Onpilot, un SaaS multi-tenant para negocios locales de servicios.

Quiero implementar la siguiente feature:

```txt
[DESCRIBIR FEATURE AQUÍ]
```

Antes de implementar, lee y respeta estos documentos:

- `docs/00-project-brief.md`
- `docs/02-roadmap.md`
- `docs/04-tech-stack.md`
- `docs/07-multi-tenancy-rules.md`
- `docs/08-security-rules.md`
- `docs/10-development-workflow.md`

Si la feature pertenece a H1, lee también:

- `docs/features/h1-agenda-clientes.md`
- `docs/05-database-model.md`
- `docs/06-api-contracts.md`

## Reglas obligatorias

- No implementes nada fuera de la feature solicitada.
- No inventes requisitos.
- No añadas dependencias sin justificar.
- No modifiques archivos no relacionados.
- No cambies arquitectura sin explicarlo.
- No aceptes `businessId` desde frontend como fuente de verdad.
- Toda query operativa debe filtrar por `businessId`.
- Valida todos los inputs.
- Controla errores.
- Mantén el código simple.
- Prioriza MVP funcional antes que perfección.

## Antes de implementar

Primero dame un plan con:

```txt
Objetivo:
Archivos a crear:
Archivos a modificar:
Modelo de datos implicado:
Endpoints implicados:
Validaciones:
Riesgos de multi-tenancy:
Riesgos de seguridad:
Comandos de validación:
```

No escribas código hasta que apruebe el plan.

## Después de implementar

Indica:

- Qué se ha implementado.
- Qué archivos se han tocado.
- Qué comandos debo ejecutar.
- Cómo probarlo manualmente.
- Qué queda pendiente.
