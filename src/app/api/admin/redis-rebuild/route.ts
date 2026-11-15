import { handler } from "@/lib/api";
import { rebuildQueue } from "@/lib/services/queue";
import { invalidateKpis, getKpis } from "@/lib/services/kpi";

export const dynamic = "force-dynamic";

/** Rebuild all derived Redis state from PostgreSQL (system of record). */
export const POST = handler(async () => {
  const queued = await rebuildQueue();
  await invalidateKpis();
  const { kpis } = await getKpis();
  return { queued, kpis };
}, "manageUsers");
