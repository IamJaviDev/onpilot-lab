import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createClient,
  deleteClient,
  getClient,
  listClients,
  updateClient,
  updateClientVip,
} from "@/lib/clients/clients-api";
import type {
  ClientFormPayload,
  ListClientsParams,
  UpdateVipPayload,
} from "@/lib/clients/types";

/** Convención de keys: invalidar `all` cubre listas y fichas. */
export const clientKeys = {
  all: ["clients"] as const,
  list: (params: ListClientsParams) => ["clients", "list", params] as const,
  detail: (id: string) => ["clients", "detail", id] as const,
};

export function useClientsList(params: ListClientsParams) {
  return useQuery({
    queryKey: clientKeys.list(params),
    queryFn: () => listClients(params),
    placeholderData: keepPreviousData, // paginación sin parpadeo
  });
}

export function useClient(id: string) {
  return useQuery({
    queryKey: clientKeys.detail(id),
    queryFn: () => getClient(id),
    enabled: Boolean(id),
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ClientFormPayload) => createClient(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: clientKeys.all }),
  });
}

export function useUpdateClient(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ClientFormPayload) => updateClient(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: clientKeys.all }),
  });
}

export function useUpdateClientVip(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateVipPayload) => updateClientVip(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: clientKeys.all }),
  });
}

export function useDeleteClient(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => deleteClient(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: clientKeys.all }),
  });
}
