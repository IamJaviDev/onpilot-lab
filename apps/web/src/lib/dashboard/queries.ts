import { useQuery } from "@tanstack/react-query";
import { getDashboardH1 } from "@/lib/dashboard/dashboard-api";

export const dashboardKeys = {
  all: ["dashboard"] as const,
  h1: () => ["dashboard", "h1"] as const,
};

export function useDashboardH1() {
  return useQuery({
    queryKey: dashboardKeys.h1(),
    queryFn: () => getDashboardH1(),
  });
}
