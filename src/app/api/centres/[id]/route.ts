import { z } from "zod";
import { handler, HttpError, intParam, parseBody } from "@/lib/api";
import { queryOne } from "@/lib/db";
import { buildUpdate } from "@/lib/sql";
import { assertCentreAccess } from "@/lib/services/access";
import { invalidateKpis } from "@/lib/services/kpi";
import { centreSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

// Fields a centre manager may update on their own centre.
const managerFields = z.object({
  current_occupancy: z.coerce.number().int().min(0),
  contact_phone: z.string().trim().min(5).max(20),
  is_active: z.boolean(),
}).partial();

export const PATCH = handler(async ({ req, user, params }) => {
  const id = intParam(params.id);
  await assertCentreAccess(user, id);
  const schema = user.role === "ADMIN" ? centreSchema.partial() : managerFields.strict();
  const b = await parseBody(req, schema);
  const { sql, values } = buildUpdate("relief_centres", b, "centre_id", id);
  const row = await queryOne(sql, values);
  if (!row) throw new HttpError(404, "Centre not found");
  await invalidateKpis();
  return { centre: row };
}, "updateCentre");
