import { z } from "zod";
import bcrypt from "bcryptjs";
import { handler, parseBody } from "@/lib/api";
import { withTransaction } from "@/lib/db";
import { ROLES, SKILLS } from "@/lib/constants";
import { listUsers } from "@/lib/queries";
import { invalidateKpis } from "@/lib/services/kpi";

export const dynamic = "force-dynamic";

export const GET = handler(async () => ({ users: await listUsers() }), "manageUsers");

export const POST = handler(async ({ req }) => {
  const b = await parseBody(req, z.object({
    full_name: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email().max(150),
    password: z.string().min(8).max(128),
    phone: z.string().trim().max(20).optional().nullable(),
    role: z.enum(ROLES),
    primary_skill: z.enum(SKILLS).optional(),
  }).refine((v) => v.role !== "VOLUNTEER" || v.primary_skill, { message: "Volunteers need a primary skill", path: ["primary_skill"] }));

  const hash = await bcrypt.hash(b.password, 10);
  const user = await withTransaction(async (c) => {
    const { rows: [u] } = await c.query(
      `INSERT INTO users (full_name, email, password_hash, phone, role) VALUES ($1,$2,$3,$4,$5)
       RETURNING user_id, full_name, email, phone, role, created_at`,
      [b.full_name, b.email, hash, b.phone || null, b.role]);
    if (b.role === "VOLUNTEER") {
      await c.query("INSERT INTO volunteer_profiles (volunteer_id, primary_skill) VALUES ($1, $2)", [u.user_id, b.primary_skill]);
    }
    return u;
  });
  await invalidateKpis();
  return { user };
}, "manageUsers");
