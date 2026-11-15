import { z } from "zod";
import { handler, parseBody } from "@/lib/api";
import { queryOne } from "@/lib/db";
import { listRequests } from "@/lib/queries";
import { REQUEST_STATUSES, URGENCY_LEVELS } from "@/lib/constants";
import { syncRequest } from "@/lib/services/queue";
import { invalidateKpis } from "@/lib/services/kpi";
import { publishAlert } from "@/lib/services/alerts";

export const dynamic = "force-dynamic";

export const GET = handler(async ({ req, user }) => {
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  return {
    requests: await listRequests({
      status: status && (REQUEST_STATUSES as readonly string[]).includes(status) ? status : undefined,
      zoneId: sp.get("zone_id") ? Number(sp.get("zone_id")) : undefined,
      requestedBy: sp.get("mine") ? user.id : undefined,
    }),
  };
});

export const POST = handler(async ({ req, user }) => {
  const b = await parseBody(req, z.object({
    zone_id: z.coerce.number().int().positive(),
    item_id: z.coerce.number().int().positive(),
    quantity_requested: z.coerce.number().int().positive(),
    urgency_level: z.enum(URGENCY_LEVELS),
    notes: z.string().trim().max(2000).optional().nullable(),
  }));
  const row = await queryOne<{ request_id: number }>(
    `INSERT INTO relief_requests (zone_id, requested_by, item_id, quantity_requested, urgency_level, notes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [b.zone_id, user.id, b.item_id, b.quantity_requested, b.urgency_level, b.notes || null]);

  await Promise.all([syncRequest(row!.request_id), invalidateKpis()]);

  if (b.urgency_level === "CRITICAL") {
    const ctx = await queryOne<{ zone_name: string; item_name: string }>(
      `SELECT z.zone_name, i.item_name FROM affected_zones z, resource_items i WHERE z.zone_id = $1 AND i.item_id = $2`,
      [b.zone_id, b.item_id]);
    await publishAlert({
      type: "CRITICAL_SOS",
      message: `CRITICAL request #${row!.request_id}: ${b.quantity_requested} × ${ctx?.item_name} for ${ctx?.zone_name}.`,
      meta: { request_id: row!.request_id, zone_id: b.zone_id },
    });
  }
  return { request: row };
}, "submitRequests");
