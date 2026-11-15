import { handler } from "@/lib/api";
import { categoryStock, dispatchSummary, inventoryAudit, requestTurnaround, zoneFulfillment } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const [zones, dispatch, categories, turnaround, audit] = await Promise.all([
    zoneFulfillment(), dispatchSummary(), categoryStock(), requestTurnaround(), inventoryAudit(undefined, 50),
  ]);
  return { zones, dispatch, categories, turnaround, audit };
}, "viewReports");
