/** Formas que devuelve la API real del panel (ver conversations.service.ts). */

export type ConversationStatus =
  | "BOT_ACTIVE"
  | "PENDING_REVIEW"
  | "HUMAN_CONTROL"
  | "CLOSED";

export type MessageDirection = "IN" | "OUT";
export type MessageAuthor = "CLIENT" | "BOT" | "HUMAN";

/** Cliente vinculado (null si el teléfono no casó con ninguna ficha). */
export interface ConversationClientRef {
  id: string;
  name: string;
}

/** Preview del último mensaje en la lista. */
export interface ConversationLastMessage {
  body: string;
  direction: MessageDirection;
  author: MessageAuthor;
  createdAt: string;
}

export interface ConversationListItem {
  id: string;
  phone: string;
  status: ConversationStatus;
  lastMessageAt: string | null;
  client: ConversationClientRef | null;
  lastMessage: ConversationLastMessage | null;
}

export interface ConversationListResponse {
  items: ConversationListItem[];
  page: number;
  limit: number;
  total: number;
}

/** Metadata publicable de un mensaje (whitelist del backend). */
export interface PublicMessageMetadata {
  reminder?: boolean;
  escalation?: { motivo: string };
}

export interface ThreadMessage {
  id: string;
  direction: MessageDirection;
  author: MessageAuthor;
  body: string;
  createdAt: string;
  metadata: PublicMessageMetadata | null;
}

/** Respuesta del hilo: cabecera + mensajes en orden ascendente. */
export interface ConversationThread {
  id: string;
  phone: string;
  status: ConversationStatus;
  client: ConversationClientRef | null;
  messages: ThreadMessage[];
}

export interface ListConversationsParams {
  status?: ConversationStatus;
  page?: number;
  limit?: number;
}
