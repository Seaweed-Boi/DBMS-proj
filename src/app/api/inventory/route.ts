import { z } from "zod";
import { handler, parseBody } from "@/lib/api";
import { listInventory } from "@/lib/queries";
import { restock } from "@/lib/services/inventory";

export const dynamic = "force-dynamic";

export const GET = handler(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const num = (k: string) => (sp.get(k) ? Number(sp.get(k)) : undefined);
  return { inventory: await listInventory({ centreId: num("centre_id"), itemId: num("item_id"), flag: sp.get("flag") ?? undefined }) };
});

/** Restock (creates or tops up a centre/item/expiry batch). */
export const POST = handler(async ({ req, user }) => {
  const b = await parseBody(req, z.object({
    centre_id: z.coerce.number().int().positive(),
    item_id: z.coerce.number().int().positive(),
    quantity: z.coerce.number().int().positive(),
    expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal("")),
    reorder_threshold: z.coerce.number().int().min(0).optional().nullable(),
  }));
  const inventoryId = await restock(user, { ...b, expiry_date: b.expiry_date || null });
  return { inventory_id: inventoryId };
}, "manageInventory");
