import { handler, HttpError, intParam, parseBody } from "@/lib/api";
import { query, queryOne } from "@/lib/db";
import { listZones } from "@/lib/queries";
import { disasterSchema } from "@/lib/schemas";
import { invalidateKpis } from "@/lib/services/kpi";
import { rebuildQueue } from "@/lib/services/queue";
import { buildUpdate } from "@/lib/sql";

export const dynamic = "force-dynamic";

export const GET = handler(async ({ params }) => {
  const id = intParam(params.id);
  const disaster = await queryOne("SELECT * FROM disasters WHERE disaster_id = $1", [id]);
  if (!disaster) throw new HttpError(404, "Disaster not found");
  return { disaster, zones: await listZones(id) };
});

export const PATCH = handler(async ({ req, params }) => {
  const id = intParam(params.id);
  const b = await parseBody(req, disasterSchema.partial());
  const { sql, values } = buildUpdate("disasters", b, "disaster_id", id);
  const row = await queryOne(sql, values);
  if (!row) throw new HttpError(404, "Disaster not found");
  await invalidateKpis();
  return { disaster: row };
}, "manageDisasters");

export const DELETE = handler(async ({ params }) => {
  const id = intParam(params.id);
  const rows = await query("DELETE FROM disasters WHERE disaster_id = $1 RETURNING disaster_id", [id]);
  if (!rows.length) throw new HttpError(404, "Disaster not found");
  await Promise.all([invalidateKpis(), rebuildQueue()]);
  return { ok: true };
}, "manageDisasters");
