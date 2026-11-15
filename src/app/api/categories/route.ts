import { z } from "zod";
import { handler, parseBody } from "@/lib/api";
import { queryOne } from "@/lib/db";
import { listCategories } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const GET = handler(async () => ({ categories: await listCategories() }));

export const POST = handler(async ({ req }) => {
  const b = await parseBody(req, z.object({
    category_name: z.string().trim().min(2).max(80),
    unit_of_measure: z.string().trim().min(1).max(30),
    is_perishable: z.coerce.boolean().default(false),
  }));
  return {
    category: await queryOne(
      "INSERT INTO resource_categories (category_name, unit_of_measure, is_perishable) VALUES ($1,$2,$3) RETURNING *",
      [b.category_name, b.unit_of_measure, b.is_perishable]),
  };
}, "manageCatalog");
