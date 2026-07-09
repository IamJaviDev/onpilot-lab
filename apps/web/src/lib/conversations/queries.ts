import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  getConversationThread,
  listConversations,
} from "@/lib/conversations/conversations-api";
import type { ListConversationsParams } from "@/lib/conversations/types";

/** Polling: lista cada 30s, hilo abierto cada 10s. Refresco al volver a foco. */
const LIST_REFETCH_MS = 30_000;
const THREAD_REFETCH_MS = 10_000;

export const conversationKeys = {
  all: ["conversations"] as const,
  list: (params: ListConversationsParams) =>
    ["conversations", "list", params] as const,
  thread: (id: string) => ["conversations", "thread", id] as const,
};

export function useConversationsList(params: ListConversationsParams) {
  return useQuery({
    queryKey: conversationKeys.list(params),
    queryFn: () => listConversations(params),
    placeholderData: keepPreviousData, // paginación/filtro sin parpadeo
    refetchInterval: LIST_REFETCH_MS,
    refetchOnWindowFocus: true, // override del default global (false)
  });
}

export function useConversationThread(id: string) {
  return useQuery({
    queryKey: conversationKeys.thread(id),
    queryFn: () => getConversationThread(id),
    enabled: Boolean(id),
    refetchInterval: THREAD_REFETCH_MS,
    refetchOnWindowFocus: true,
  });
}
