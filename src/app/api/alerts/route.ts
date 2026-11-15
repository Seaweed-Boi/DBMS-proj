import { handler } from "@/lib/api";
import { recentAlerts } from "@/lib/services/alerts";

export const dynamic = "force-dynamic";
export const GET = handler(async () => ({ alerts: await recentAlerts(20) }));
