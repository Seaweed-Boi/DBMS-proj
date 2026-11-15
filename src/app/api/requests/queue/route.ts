import { handler } from "@/lib/api";
import { getQueue } from "@/lib/services/queue";

export const dynamic = "force-dynamic";

/** Urgency-ranked open requests from the Redis sorted set (PostgreSQL fallback). */
export const GET = handler(async ({ req }) => {
  const limit = Math.min(200, Number(new URL(req.url).searchParams.get("limit") ?? 50));
  return getQueue(limit);
});
