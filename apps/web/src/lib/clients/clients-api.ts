import { apiRequest } from "@/lib/api-client";
import type {
  ClientDetail,
  ClientFormPayload,
  ClientListResponse,
  ListClientsParams,
  UpdateVipPayload,
} from "@/lib/clients/types";

const BASE = "/api/clients";

/** Todas las llamadas pasan por apiRequest (Bearer + refresh single-flight). */

export function listClients(
  params: ListClientsParams,
): Promise<ClientListResponse> {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiRequest<ClientListResponse>(`${BASE}${suffix}`);
}

export function getClient(id: string): Promise<ClientDetail> {
  return apiRequest<ClientDetail>(`${BASE}/${id}`);
}

export function createClient(
  payload: ClientFormPayload,
): Promise<ClientDetail> {
  return apiRequest<ClientDetail>(BASE, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateClient(
  id: string,
  payload: ClientFormPayload,
): Promise<ClientDetail> {
  return apiRequest<ClientDetail>(`${BASE}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function updateClientVip(
  id: string,
  payload: UpdateVipPayload,
): Promise<ClientDetail> {
  return apiRequest<ClientDetail>(`${BASE}/${id}/vip`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteClient(id: string): Promise<void> {
  return apiRequest<void>(`${BASE}/${id}`, { method: "DELETE" });
}
