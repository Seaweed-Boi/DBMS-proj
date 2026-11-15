import { zoneSchema } from "@/lib/schemas";
import { handler, parseBody } from "@/lib/api";
import { queryOne } from "@/lib/db";
import { listZones } from "@/lib/queries";
import { invalidateKpis } from "@/lib/services/kpi";

export const dynamic = "force-dynamic";


export const GET = handler(async ({ req }) => {
  const d = new URL(req.url).searchParams.get("disaster_id");
  return { zones: await listZones(d ? Number(d) : undefined) };
});

export const POST = handler(async ({ req }) => {
  const b = await parseBody(req, zoneSchema);
  const row = await queryOne(
    `INSERT INTO affected_zones (disaster_id, zone_name, district, latitude, longitude, affected_population, urgency_score, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [b.disaster_id, b.zone_name, b.district, b.latitude ?? null, b.longitude ?? null,
     b.affected_population, b.urgency_score ?? 0, b.status]);
  await invalidateKpis();
  return { zone: row };
}, "manageZones");
