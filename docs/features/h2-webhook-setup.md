# H2 — Webhook de WhatsApp: configuración y verificación

Guía operativa para la **Tarea 2/9** (recepción). Cubre el túnel de desarrollo,
la configuración en el panel de Meta y la receta de pruebas por curl (sin Meta).

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
```

- **verify token**: lo inventas tú (cualquier string difícil). Se repite tal cual
  en el panel de Meta. Solo se usa en el GET de verificación.
- **App Secret**: Meta for Developers → tu app → *Configuración de la app → Básica*
  → *Clave secreta de la app*. Con él se firma/valida el cuerpo. **Nunca al repo.**
- **phone_number_id**: panel de WhatsApp → *API Setup* (el ID largo, no el número).
- **WHATSAPP_BUSINESS_ID**: el `id` (UUID) de tu negocio de prueba en la tabla
  `Business`. Sáscalo con: `psql "$DATABASE_URL" -c 'select id, name from "Business";'`

La API **no arranca** si falta cualquiera de las cuatro (fail-fast en
`env.validation.ts`).

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

## 4. Verificación por curl (sin Meta)

Con la API arrancada en `:4000`. Sustituye `APP_SECRET` por el real de tu `.env`.

### 4.1 GET — challenge

```bash
# Token correcto → devuelve el challenge, 200
curl -s "http://localhost:4000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=EL_VERIFY_TOKEN&hub.challenge=ooofrreemieNNIIFEWnbbvqqlKLOmmmredeswnsjssdSSDasbvvvuryeecpLpPlhhGMn"
# → 1234567890

# Token incorrecto → 403
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://localhost:4000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=MAL&hub.challenge=1234567890"
# → 403
```

### 4.2 POST — mensaje entrante (firma válida)

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

### 4.3 POST — dedupe (mismo payload otra vez)

Repite el **mismo** curl de 4.2. Respuesta `200`, log `duplicate webhook,
ignored` y **ninguna segunda fila** en `Message`.

### 4.4 POST — firma inválida

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "http://localhost:4000/api/webhooks/whatsapp" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=deadbeef" \
  --data-binary @/tmp/wa-payload.json
# → 401, nada persistido
```

### 4.5 POST — solo statuses / tipo no-texto (firma válida)

Un payload con `value.statuses` (delivered/read) o un `messages[].type` distinto
de `text`, firmado correctamente → `200`, log de "ignoring", **nada persistido**.

---

## 5. Verificación en vivo (Meta real)

1. API + túnel arrancados; callback URL + verify token + suscripción a `messages`
   configurados en el panel.
2. Escribe un WhatsApp desde tu móvil al número de prueba.
3. `psql`: la `Conversation` se creó y el `Message` IN está persistido con su
   `waMessageId`.
