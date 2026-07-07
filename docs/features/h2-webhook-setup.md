# H2 — Webhook de WhatsApp: configuración y verificación

Guía operativa para las **Tareas 2/9 (recepción), 3/9 (envío) y 4/9 (BotEngine)**.
Cubre el túnel de desarrollo, la configuración en el panel de Meta, el token
permanente de System User (§7) y las recetas de verificación (curl y en vivo).

> Claude Code **no** instala ni ejecuta el túnel ni levanta servidores: esos
> pasos los hace Javier. Aquí quedan documentados.

---

## 1. Variables de entorno

En `apps/api/.env` (ver `.env.example`):

```
WHATSAPP_WEBHOOK_VERIFY_TOKEN=<string aleatorio que inventas tú>
WHATSAPP_APP_SECRET=<App Secret de la app de Meta>
WHATSAPP_PHONE_NUMBER_ID=<phone_number_id del número de prueba>
WHATSAPP_BUSINESS_ID=<UUID del Business sandbox en tu BD>
WHATSAPP_ACCESS_TOKEN=<token permanente de System User — ver §7>
ANTHROPIC_API_KEY=<API key de Anthropic — console.anthropic.com>
BOT_ENGINE_ENABLED=false       # opcional; solo 'true' exacto activa el bot (§8)
```

- **verify token**: lo inventas tú (cualquier string difícil). Se repite tal cual
  en el panel de Meta. Solo se usa en el GET de verificación.
- **App Secret**: Meta for Developers → tu app → *Configuración de la app → Básica*
  → *Clave secreta de la app*. Con él se firma/valida el cuerpo. **Nunca al repo.**
- **phone_number_id**: panel de WhatsApp → *API Setup* (el ID largo, no el número).
- **WHATSAPP_BUSINESS_ID**: el `id` (UUID) de tu negocio de prueba en la tabla
  `Business`. Sáscalo con: `psql "$DATABASE_URL" -c 'select id, name from "Business";'`
- **WHATSAPP_ACCESS_TOKEN**: token permanente de System User para enviar
  mensajes por la Graph API. Cómo generarlo: §7. **Nunca al repo.**
- **ANTHROPIC_API_KEY**: API key de Anthropic para el BotEngine (Tarea 4).
  Se genera en console.anthropic.com → API Keys. Mismas reglas que el access
  token: **nunca al repo**, nunca a logs.
- **BOT_ENGINE_ENABLED**: flag del BotEngine v0. Opcional; solo el string
  **exacto** `true` lo activa (cualquier otro valor u omisión = apagado).

La API **no arranca** si falta cualquiera de las obligatorias — las cinco de
WhatsApp y `ANTHROPIC_API_KEY` (fail-fast en `env.validation.ts`); el flag del
bot es opcional.

---

## 2. Túnel de desarrollo

Meta exige una URL pública HTTPS. En local, túnel hacia `:4000`:

```bash
# 1) Arranca la API
pnpm --filter @onpilot/api dev        # o el script real de arranque de la api

# 2) En otra terminal, el túnel (ejemplo con ngrok)
ngrok http 4000
```

ngrok imprime una URL tipo `https://xxxx.ngrok-free.app`. La callback será:

```
https://xxxx.ngrok-free.app/api/webhooks/whatsapp
```

(Cualquier alternativa —cloudflared, localtunnel— vale; solo importa que sea
HTTPS pública apuntando a `:4000`.)

---

## 3. Configuración en el panel de Meta

Meta for Developers → tu app → **WhatsApp → Configuración** (o *Configuración de
la app → Webhooks* según el caso de uso):

1. **Callback URL**: `https://xxxx.ngrok-free.app/api/webhooks/whatsapp`
2. **Verify token**: el mismo valor de `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
3. Pulsa **Verificar y guardar**. Meta hace un `GET` con `hub.challenge`; si el
   token casa, el backend devuelve el challenge y Meta marca el webhook OK.
4. **Suscríbete al campo `messages`** (Webhook fields → `messages` → Suscribir).
   Sin esta suscripción no llegan los POST de mensajes entrantes.

---

## 4. Suscripción de la app a la WABA (Graph API)

⚠️ **Paso imprescindible y no obvio** (hallazgo de la verificación en vivo). Hay
**dos suscripciones distintas** y el panel solo hace la primera:

- **App → campo `messages`** (toggle del panel, §3.4): qué *tipo* de evento
  quiere recibir la app.
- **App → tu WABA concreta** (solo vía Graph API): a qué *cuenta de WhatsApp
  Business* se engancha la app.

Sin la segunda, **el challenge se verifica pero los mensajes NO llegan**: Meta no
entrega ningún POST al túnel. El toggle del panel no crea esta suscripción.

> **Síntoma de diagnóstico rápido:** "challenge verificado + campo `messages`
> activado, pero ningún POST llega a ngrok al enviar un WhatsApp" → comprobar
> `subscribed_apps`.

### 4.1 Comprobar

```bash
curl -s "https://graph.facebook.com/v25.0/WABA_ID/subscribed_apps" \
  -H "Authorization: Bearer TOKEN_DE_ACCESO"
```

Si `data` **no** incluye tu app, falta la suscripción. (Puede aparecer solo la
app interna de Meta, "WA DevX Webhook Events 1P App" — esa no es la tuya.)

### 4.2 Suscribir

```bash
curl -s -X POST "https://graph.facebook.com/v25.0/WABA_ID/subscribed_apps" \
  -H "Authorization: Bearer TOKEN_DE_ACCESO"
```

Esperado: `{"success":true}`. Re-ejecuta el GET de 4.1: tu app debe aparecer
ahora en `data`.

### Notas

- **WABA_ID**: el WhatsApp Business Account ID (panel de WhatsApp → *API Setup*).
- **TOKEN_DE_ACCESO**: el token temporal del panel (Paso 1 → *Identificador de
  acceso*) o el permanente (System User) cuando exista. **Placeholders en el doc,
  jamás el valor real.**

---

## 5. Verificación por curl (sin Meta)

Con la API arrancada en `:4000`. Sustituye `APP_SECRET` por el real de tu `.env`.

### 5.1 GET — challenge

```bash
# Token correcto → devuelve el challenge, 200
curl -s "http://localhost:4000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=EL_VERIFY_TOKEN&hub.challenge=ooofrreemieNNIIFEWnbbvqqlKLOmmmredeswnsjssdSSDasbvvvuryeecpLpPlhhGMn"
# → 1234567890

# Token incorrecto → 403
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://localhost:4000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=MAL&hub.challenge=1234567890"
# → 403
```

### 5.2 POST — mensaje entrante (firma válida)

Guarda un payload de ejemplo (mensaje de texto real de Cloud API). **Ajusta
`phone_number_id` para que coincida con tu `WHATSAPP_PHONE_NUMBER_ID`.**

```bash
cat > /tmp/wa-payload.json <<'JSON'
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "WABA_ID",
      "changes": [
        {
          "field": "messages",
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "15550257710",
              "phone_number_id": "TU_PHONE_NUMBER_ID"
            },
            "contacts": [
              { "profile": { "name": "Javier" }, "wa_id": "34600000000" }
            ],
            "messages": [
              {
                "from": "34600000000",
                "id": "wamid.TEST0001",
                "timestamp": "1751731200",
                "type": "text",
                "text": { "body": "Hola, quiero una cita" }
              }
            ]
          }
        }
      ]
    }
  ]
}
JSON
```

Firma el **cuerpo crudo** con el App Secret y envíalo. Importante: se envía el
mismo fichero exacto que se firmó (`--data-binary`).

```bash
APP_SECRET='pega-aqui-tu-app-secret'
SIG=$(node -e "const c=require('crypto');const fs=require('fs');const b=fs.readFileSync('/tmp/wa-payload.json');process.stdout.write('sha256='+c.createHmac('sha256',process.argv[1]).update(b).digest('hex'))" "$APP_SECRET")

curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "http://localhost:4000/api/webhooks/whatsapp" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $SIG" \
  --data-binary @/tmp/wa-payload.json
# → 200
```

Comprueba en BD que se creó la conversación y el mensaje:

```bash
psql "$DATABASE_URL" -c 'select id, "businessId", phone, status, "lastMessageAt" from "Conversation" order by "createdAt" desc limit 3;'
psql "$DATABASE_URL" -c 'select id, direction, author, body, "waMessageId" from "Message" order by "createdAt" desc limit 3;'
```

### 5.3 POST — dedupe (mismo payload otra vez)

Repite el **mismo** curl de 5.2. Respuesta `200`, log `duplicate webhook,
ignored` y **ninguna segunda fila** en `Message`.

### 5.4 POST — firma inválida

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "http://localhost:4000/api/webhooks/whatsapp" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=deadbeef" \
  --data-binary @/tmp/wa-payload.json
# → 401, nada persistido
```

### 5.5 POST — solo statuses / tipo no-texto (firma válida)

Un payload con `value.statuses` (delivered/read) o un `messages[].type` distinto
de `text`, firmado correctamente → `200`, log de "ignoring", **nada persistido**.

---

## 6. Verificación en vivo (Meta real)

1. API + túnel arrancados; callback URL + verify token + suscripción a `messages`
   configurados en el panel.
2. Escribe un WhatsApp desde tu móvil al número de prueba.
3. `psql`: la `Conversation` se creó y el `Message` IN está persistido con su
   `waMessageId`.

---

## 7. Token permanente (System User)

El token del panel (*API Setup → Identificador de acceso*) **caduca cada 24h**:
inútil para desarrollo continuado. Para enviar mensajes (Tarea 3 en adelante) se
usa el token de un **System User** del Business Portfolio, que puede no caducar.

> Todo esto es panel de Meta: lo haces tú, no Claude Code.

### 7.1 Crear el System User

1. [business.facebook.com](https://business.facebook.com) → **Configuración del
   negocio** (elige el portfolio de Onpilot).
2. Menú **Usuarios → Usuarios del sistema** → **Añadir**.
3. Nombre (p. ej. `onpilot-backend`) y rol:
   - **Empleado**: suficiente si luego le asignas la app y la WABA con permisos
     de gestión (opción recomendada: mínimo privilegio).
   - **Administrador**: lo pide Meta para ciertas operaciones administrativas;
     para enviar/gestionar mensajes no hace falta.

### 7.2 Asignar activos

En la ficha del System User → **Asignar activos**:

1. **Apps** → selecciona la app de Onpilot → activa **Administrar app** (o al
   menos "Desarrollar app").
2. **Cuentas de WhatsApp** → selecciona la WABA de prueba → activa la gestión
   de la cuenta (mensajes).

Sin ambos activos el token se genera pero la Graph API devolverá errores de
permisos al enviar.

### 7.3 Generar el token

En la ficha del System User → **Generar nuevo token**:

1. **App**: la app de Onpilot.
2. **Caducidad**: dos opciones válidas —
   - **Nunca** (recomendada en desarrollo: no hay que rotarlo; a cambio, si se
     filtra hay que revocarlo a mano desde esta misma pantalla).
   - **60 días** (más conservadora; apunta un recordatorio de rotación).
3. **Permisos (scopes)**: marca `whatsapp_business_messaging` y
   `whatsapp_business_management`. Nada más (mínimo privilegio).
4. Copia el token **una sola vez** (Meta no lo vuelve a mostrar) y pégalo en
   `apps/api/.env` como `WHATSAPP_ACCESS_TOKEN`.

### 7.4 Higiene del token

- **JAMÁS** en el repo, en el chat de trabajo, en capturas de pantalla ni en
  logs. Solo en `.env` (ignorado por Git).
- Si se filtra: ficha del System User → el token → **revocar**, y generar otro.
- Este token sustituye al temporal del panel en TODO (curls de §4 incluidos).

### 7.5 Comprobación rápida

```bash
curl -s "https://graph.facebook.com/v25.0/WABA_ID/subscribed_apps" \
  -H "Authorization: Bearer $WHATSAPP_ACCESS_TOKEN"
```

Si responde el JSON de suscripciones (y no un error OAuth), el token funciona.

---

## 8. Verificación en vivo del bot (Tarea 4)

Con el token de §7 y `ANTHROPIC_API_KEY` ya en `.env`:

> **Conversación limpia**: si la conversación abierta arrastra ecos de la
> Tarea 3, ciérrala por psql (`CLOSED`) y empieza una nueva — el invariante
> "una conversación abierta por teléfono" lo permite:
>
> ```bash
> psql "$DATABASE_URL" -c 'update "Conversation" set status = '"'"'CLOSED'"'"' where id = '"'"'<CONVERSATION_ID>'"'"';'
> ```

1. `BOT_ENGINE_ENABLED=true` en `apps/api/.env` (exactamente `true`).
2. Arranca API + túnel; si la URL de ngrok cambió, actualiza la callback URL en
   el panel (§3).
3. Conversación real desde el móvil al número de prueba:
   - **Saludo** → debe identificarse como asistente automático del negocio
     (Art. 50: identificación proactiva en el primer mensaje).
   - **Servicios/precios** → debe responder SOLO los de la BD, sin inventar.
   - **Fuera de scope** (fútbol, noticias…) → redirección a temas del negocio.
   - **Pedir cita** → "tomo nota, el equipo confirma", sin inventar huecos ni
     confirmar nada.
   - **Algo que no sabe** → "no tengo esa información, aviso al equipo".
4. `psql`: el OUT del bot con `author=BOT`, un `waMessageId` real de Meta y
   `metadata` con los tokens (medición de coste desde el día 1):

   ```bash
   psql "$DATABASE_URL" -c 'select direction, author, left(body, 60), metadata from "Message" order by "createdAt" desc limit 4;'
   ```

5. **Prueba de estados** (el sistema calla fuera de BOT_ACTIVE; actualizar por
   id, como aprendimos):

   ```bash
   # pasar la conversación a control humano
   psql "$DATABASE_URL" -c 'update "Conversation" set status = '"'"'HUMAN_CONTROL'"'"' where id = '"'"'<CONVERSATION_ID>'"'"';'
   ```

   Mensaje desde el móvil → **silencio** (el IN sí se persiste). Devuélvela a
   `BOT_ACTIVE` al terminar.

6. Al acabar la sesión de pruebas, `BOT_ENGINE_ENABLED=false` (o quitar la
   línea): el default es apagado.

---

## 9. Verificación en vivo de las acciones de agenda (Tarea 5)

Requisito previo — **seed del horario de Fruteria Javier** (sin horario el bot
no puede consultar disponibilidad). Jornada partida de lunes a viernes +
sábado por la mañana; ajusta a tu gusto:

```bash
psql "$DATABASE_URL" <<'SQL'
update "Business"
set "weeklySchedule" = '{
  "mon": [{"start":"09:00","end":"14:00"},{"start":"17:00","end":"20:00"}],
  "tue": [{"start":"09:00","end":"14:00"},{"start":"17:00","end":"20:00"}],
  "wed": [{"start":"09:00","end":"14:00"},{"start":"17:00","end":"20:00"}],
  "thu": [{"start":"09:00","end":"14:00"},{"start":"17:00","end":"20:00"}],
  "fri": [{"start":"09:00","end":"14:00"},{"start":"17:00","end":"20:00"}],
  "sat": [{"start":"09:00","end":"14:00"}]
}'::jsonb
where id = '<BUSINESS_ID>';
SQL
```

Formato: claves `mon..sun`, intervalos `{start,end}` en `HH:mm` (hora local
del negocio, `Business.timezone`); día ausente = cerrado; un Json mal formado
equivale a "sin horario" (el bot lo dirá y quedará un warn en el log).

Con `BOT_ENGINE_ENABLED=true`, API + túnel (§8) y conversación limpia:

1. **Reserva completa desde el móvil**: pide una cita → el bot pregunta
   servicio/día → propone huecos (contrástalos contra la Agenda del frontend:
   deben ser reales) → recapitula y pide confirmación explícita → confirma →
   **la cita aparece en la Agenda de Onpilot** con origen WhatsApp.
2. **Doble reserva del mismo hueco** (segunda conversación u otro móvil, o
   creando antes la cita a mano en la web): el bot debe disculparse y
   re-ofrecer alternativas SIN crear nada.
3. **Día cerrado / sin huecos**: pide un domingo → "cerrado/no tengo huecos",
   sin inventar horas.
4. `psql` — la cita creada por el bot (sin usuario, origen WHATSAPP):

   ```bash
   psql "$DATABASE_URL" -c 'select "startsAt", "endsAt", status, source, "createdById" from "Appointment" order by "createdAt" desc limit 3;'
   ```

5. `psql` — metadata del flujo completo (tokens acumulados + toolCalls):

   ```bash
   psql "$DATABASE_URL" -c 'select left(body, 50), metadata from "Message" where direction = '"'"'OUT'"'"' order by "createdAt" desc limit 5;'
   ```

6. Al acabar, `BOT_ENGINE_ENABLED=false` si no quieres el bot activo.
