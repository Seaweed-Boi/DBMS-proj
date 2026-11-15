import { z } from "zod";
import { handler, parseBody } from "@/lib/api";
import { queryOne } from "@/lib/db";
import { listItems } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const GET = handler(async () => ({ items: await listItems() }));

export const POST = handler(async ({ req }) => {
  const b = await parseBody(req, z.object({
    category_id: z.coerce.number().int().positive(),
    item_name: z.string().trim().min(2).max(120),
    sku: z.string().trim().min(2).max(50).transform((s) => s.toUpperCase()),
    description: z.string().trim().optional().nullable(),
  }));
  return {
    item: await queryOne(
      "INSERT INTO resource_items (category_id, item_name, sku, description) VALUES ($1,$2,$3,$4) RETURNING *",
      [b.category_id, b.item_name, b.sku, b.description || null]),
  };
}, "manageCatalog");
