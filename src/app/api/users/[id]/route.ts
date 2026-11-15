import { z } from "zod";
import bcrypt from "bcryptjs";
import { handler, HttpError, intParam, parseBody } from "@/lib/api";
import { query, queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Role changes are intentionally not supported: role drives FK-dependent invariants (ISA, managers). */
export const PATCH = handler(async ({ req, params }) => {
  const id = intParam(params.id);
  const b = await parseBody(req, z.object({
    full_name: z.string().trim().min(2).max(120).optional(),
    phone: z.string().trim().max(20).optional().nullable(),
    password: z.string().min(8).max(128).optional(),
  }));
  const hash = b.password ? await bcrypt.hash(b.password, 10) : null;
  const row = await queryOne(
    `UPDATE users SET full_name = COALESCE($2, full_name),
                      phone = CASE WHEN $3::boolean THEN $4 ELSE phone END,
                      password_hash = COALESCE($5, password_hash)
      WHERE user_id = $1 RETURNING user_id, full_name, email, phone, role`,
    [id, b.full_name ?? null, b.phone !== undefined, b.phone || null, hash]);
  if (!row) throw new HttpError(404, "User not found");
  return { user: row };
}, "manageUsers");

export const DELETE = handler(async ({ params, user }) => {
  const id = intParam(params.id);
  if (id === user.id) throw new HttpError(400, "You cannot delete your own account");
  const rows = await query("DELETE FROM users WHERE user_id = $1 RETURNING user_id", [id]);
  if (!rows.length) throw new HttpError(404, "User not found");
  return { ok: true };
}, "manageUsers");
