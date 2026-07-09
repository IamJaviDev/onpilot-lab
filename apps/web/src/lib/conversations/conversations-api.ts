import { apiRequest } from "@/lib/api-client";
import type {
  ConversationListResponse,
  ConversationThread,
  ListConversationsParams,
} from "@/lib/conversations/types";

const BASE = "/api/conversations";

/** Solo lectura: lista paginada + hilo. Bearer + refresh vía apiRequest. */

export function listConversations(
  params: ListConversationsParams,
): Promise<ConversationListResponse> {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiRequest<ConversationListResponse>(`${BASE}${suffix}`);
}

export function getConversationThread(
  id: string,
): Promise<ConversationThread> {
  return apiRequest<ConversationThread>(`${BASE}/${id}/messages`);
}
