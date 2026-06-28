import { apiRequest } from "@/lib/api-client";
import type { CashSummary, CashSummaryParams } from "@/lib/cash/types";

const BASE = "/api/cash/summary";

export function getCashSummary(
  params: CashSummaryParams,
): Promise<CashSummary> {
  const qs = new URLSearchParams();
  qs.set("from", params.from);
  qs.set("to", params.to);
  return apiRequest<CashSummary>(`${BASE}?${qs.toString()}`);
}
