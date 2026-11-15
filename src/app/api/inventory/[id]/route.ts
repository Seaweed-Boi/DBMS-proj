import { z } from "zod";
import { handler, HttpError, intParam, parseBody } from "@/lib/api";
import { queryOne } from "@/lib/db";
import { inventoryAudit } from "@/lib/queries";
import { adjustStock } from "@/lib/services/inventory";

export const dynamic = "force-dynamic";

export const GET = handler(async ({ params }) => {
  const id = intParam(params.id);
  const batch = await queryOne("SELECT * FROM v_inventory_health WHERE inventory_id = $1", [id]);
  if (!batch) throw new HttpError(404, "Inventory batch not found");
  return { batch, audit: await inventoryAudit(id) };
});

/** Manual adjustment (spoilage / recount) and threshold changes. */
export const PATCH = handler(async ({ req, user, params }) => {
  const id = intParam(params.id);
  const b = await parseBody(req, z.object({
    delta: z.coerce.number().int().optional(),
    reorder_threshold: z.coerce.number().int().min(0).optional(),
  }).refine((v) => v.delta !== undefined || v.reorder_threshold !== undefined, "Provide delta or reorder_threshold"));
  await adjustStock(user, id, b);
  return { ok: true };
}, "manageInventory");
