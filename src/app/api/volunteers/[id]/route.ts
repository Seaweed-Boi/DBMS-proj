import { z } from "zod";
import { handler, HttpError, intParam, parseBody } from "@/lib/api";
import { queryOne } from "@/lib/db";
import { can, SKILLS } from "@/lib/constants";
import { invalidateKpis } from "@/lib/services/kpi";

export const dynamic = "force-dynamic";

const nullableId = z.union([z.coerce.number().int().positive(), z.literal(""), z.null()])
  .transform((v) => (v === "" ? null : v));

/**
 * Coordinators/managers/admins assign volunteers to centres/zones.
 * A volunteer may toggle their own availability (AVAILABLE <-> ON_LEAVE).
 * Status is normalised by the volunteer_role_isa trigger:
 *   any assignment => DEPLOYED; ON_LEAVE clears assignments.
 */
export const PATCH = handler(async ({ req, user, params }) => {
  const id = intParam(params.id);
  const b = await parseBody(req, z.object({
    primary_skill: z.enum(SKILLS).optional(),
    assigned_centre_id: nullableId.optional(),
    assigned_zone_id: nullableId.optional(),
    availability_status: z.enum(["AVAILABLE", "ON_LEAVE"]).optional(),
  }));

  const isAssigner = can(user.role, "assignVolunteers");
  if (!isAssigner) {
    if (user.id !== id) throw new HttpError(403, "Not permitted");
    if (b.primary_skill || b.assigned_centre_id !== undefined || b.assigned_zone_id !== undefined) {
      throw new HttpError(403, "Volunteers may only change their own availability");
    }
  }

  // Returning to AVAILABLE clears assignments; otherwise keep existing values unless provided.
  const release = b.availability_status === "AVAILABLE" && b.assigned_centre_id === undefined && b.assigned_zone_id === undefined;
  const row = await queryOne(
    `UPDATE volunteer_profiles SET
        primary_skill       = COALESCE($2, primary_skill),
        assigned_centre_id  = CASE WHEN $6 THEN NULL WHEN $3::boolean THEN $4::int ELSE assigned_centre_id END,
        assigned_zone_id    = CASE WHEN $6 THEN NULL WHEN $5::boolean THEN $7::int ELSE assigned_zone_id END,
        availability_status = COALESCE($8, availability_status)
      WHERE volunteer_id = $1 RETURNING *`,
    [id, b.primary_skill ?? null,
     b.assigned_centre_id !== undefined, b.assigned_centre_id ?? null,
     b.assigned_zone_id !== undefined, release, b.assigned_zone_id ?? null,
     b.availability_status ?? null]);
  if (!row) throw new HttpError(404, "Volunteer not found");
  await invalidateKpis();
  return { volunteer: row };
});
