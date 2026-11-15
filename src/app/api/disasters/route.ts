import { disasterSchema } from "@/lib/schemas";
import { handler, parseBody } from "@/lib/api";
import { queryOne } from "@/lib/db";
import { listDisasters } from "@/lib/queries";
import { invalidateKpis } from "@/lib/services/kpi";

export const dynamic = "force-dynamic";


export const GET = handler(async () => ({ disasters: await listDisasters() }));

export const POST = handler(async ({ req }) => {
  const b = await parseBody(req, disasterSchema);
  const row = await queryOne(
    `INSERT INTO disasters (title, disaster_type, severity_level, start_date, status, description)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [b.title, b.disaster_type, b.severity_level, b.start_date, b.status, b.description || null]);
  await invalidateKpis();
  return { disaster: row };
}, "manageDisasters");
