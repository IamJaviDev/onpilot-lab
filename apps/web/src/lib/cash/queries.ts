import { useQuery } from "@tanstack/react-query";
import { getCashSummary } from "@/lib/cash/cash-api";
import type { CashSummaryParams } from "@/lib/cash/types";

export const cashKeys = {
  all: ["cash"] as const,
  summary: (params: CashSummaryParams) => ["cash", "summary", params] as const,
};

export function useCashSummary(params: CashSummaryParams) {
  return useQuery({
    queryKey: cashKeys.summary(params),
    queryFn: () => getCashSummary(params),
  });
}
