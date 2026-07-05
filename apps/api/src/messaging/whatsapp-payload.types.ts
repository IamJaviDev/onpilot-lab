// Tipos del payload del webhook de WhatsApp Cloud API (campo `messages`).
// Solo se modela lo que esta tarea consume; el resto se ignora a propósito.
// Todos los campos son opcionales/laxos: el payload viene de un tercero y la
// firma HMAC ya garantiza autenticidad — aquí solo navegamos con defensa.

export interface WhatsAppMessage {
  // Teléfono del remitente: dígitos en formato internacional, SIN '+'.
  from: string;
  // id del mensaje en WhatsApp; clave de idempotencia (waMessageId).
  id: string;
  // unix epoch en segundos, como string.
  timestamp: string;
  // 'text' | 'image' | 'audio' | 'button' | 'interactive' | ...
  type: string;
  text?: { body: string };
}

export interface WhatsAppStatus {
  id: string;
  // 'sent' | 'delivered' | 'read' | 'failed'
  status: string;
  timestamp: string;
  recipient_id: string;
}

export interface WhatsAppMetadata {
  display_phone_number?: string;
  phone_number_id?: string;
}

export interface WhatsAppChangeValue {
  messaging_product?: string;
  metadata?: WhatsAppMetadata;
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatus[];
}

export interface WhatsAppChange {
  value: WhatsAppChangeValue;
  field?: string;
}

export interface WhatsAppEntry {
  id?: string;
  changes?: WhatsAppChange[];
}

export interface WhatsAppWebhookPayload {
  object?: string;
  entry?: WhatsAppEntry[];
}
