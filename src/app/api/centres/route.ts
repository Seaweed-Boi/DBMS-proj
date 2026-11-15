import { centreSchema } from "@/lib/schemas";
import { handler, parseBody } from "@/lib/api";
import { queryOne } from "@/lib/db";
import { listCentres } from "@/lib/queries";
import { invalidateKpis } from "@/lib/services/kpi";

export const dynamic = "force-dynamic";


export const GET = handler(async () => ({ centres: await listCentres() }));

export const POST = handler(async ({ req }) => {
  const b = await parseBody(req, centreSchema);
  const row = await queryOne(
    `INSERT INTO relief_centres (manager_id, centre_name, address, district, total_capacity, current_occupancy, contact_phone, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [b.manager_id, b.centre_name, b.address, b.district, b.total_capacity, b.current_occupancy, b.contact_phone, b.is_active]);
  await invalidateKpis();
  return { centre: row };
}, "manageCentres");
