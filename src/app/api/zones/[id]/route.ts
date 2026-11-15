import { handler, HttpError, intParam, parseBody } from "@/lib/api";
import { query, queryOne } from "@/lib/db";
import { zoneSchema } from "@/lib/schemas";
import { buildUpdate } from "@/lib/sql";
import { invalidateKpis } from "@/lib/services/kpi";
import { syncZoneRequests } from "@/lib/services/queue";

export const dynamic = "force-dynamic";

export const PATCH = handler(async ({ req, params }) => {
  const id = intParam(params.id);
  const b = await parseBody(req, zoneSchema.omit({ disaster_id: true }).partial());
  const { sql, values } = buildUpdate("affected_zones", b, "zone_id", id);
  const row = await queryOne(sql, values);
  if (!row) throw new HttpError(404, "Zone not found");
  await Promise.all([invalidateKpis(), syncZoneRequests(id)]);
  return { zone: row };
}, "manageZones");

export const DELETE = handler(async ({ params }) => {
  const id = intParam(params.id);
  const rows = await query("DELETE FROM affected_zones WHERE zone_id = $1 RETURNING zone_id", [id]);
  if (!rows.length) throw new HttpError(404, "Zone not found");
  await invalidateKpis();
  return { ok: true };
}, "manageZones");
