import { handler } from "@/lib/api";
import { getKpis } from "@/lib/services/kpi";
import { getQueue } from "@/lib/services/queue";
import { recentAlerts } from "@/lib/services/alerts";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const [kpis, queue, alerts] = await Promise.all([getKpis(), getQueue(5), recentAlerts(10)]);
  return { kpis: kpis.kpis, kpiSource: kpis.source, topRequests: queue.entries, queueSource: queue.source, alerts };
});
