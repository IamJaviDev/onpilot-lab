import { apiRequest } from "@/lib/api-client";
import type { ListServicesParams, Service } from "@/lib/services/types";

const BASE = "/api/services";

/** GET /api/services devuelve un array pelado (activos por defecto). */
export function listServices(
  params: ListServicesParams = {},
): Promise<Service[]> {
  const qs = new URLSearchParams();
  if (params.includeInactive) qs.set("includeInactive", "true");
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiRequest<Service[]>(`${BASE}${suffix}`);
}
