import { useQuery } from "@tanstack/react-query";
import { listServices } from "@/lib/services/services-api";
import type { ListServicesParams } from "@/lib/services/types";

export const serviceKeys = {
  all: ["services"] as const,
  list: (params: ListServicesParams) => ["services", "list", params] as const,
};

export function useServicesList(params: ListServicesParams = {}) {
  return useQuery({
    queryKey: serviceKeys.list(params),
    queryFn: () => listServices(params),
  });
}
