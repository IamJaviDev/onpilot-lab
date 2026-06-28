import { apiRequest } from "@/lib/api-client";
import type { DashboardH1 } from "@/lib/dashboard/types";

/** El backend calcula los KPIs en la zona del negocio; sin query params. */
export function getDashboardH1(): Promise<DashboardH1> {
  return apiRequest<DashboardH1>("/api/dashboard/h1");
}
