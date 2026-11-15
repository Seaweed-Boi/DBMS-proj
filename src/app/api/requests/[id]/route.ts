import { z } from "zod";
import { handler, HttpError, intParam, parseBody } from "@/lib/api";
import { queryOne, withTransaction } from "@/lib/db";
import { can, URGENCY_LEVELS } from "@/lib/constants";
import { listAllocations } from "@/lib/queries";
import { syncRequest } from "@/lib/services/queue";
import { invalidateKpis } from "@/lib/services/kpi";

export const dynamic = "force-dynamic";

export const GET = handler(async ({ params }) => {
  const id = intParam(params.id);
  const request = await queryOne(
    `SELECT r.*, fn_request_priority(r.request_id) AS priority_score, z.zone_name, i.item_name
       FROM relief_requests r JOIN affected_zones z USING (zone_id) JOIN resource_items i USING (item_id)
      WHERE r.request_id = $1`, [id]);
  if (!request) throw new HttpError(404, "Request not found");
  return { request, allocations: await listAllocations({ requestId: id }) };
});

/**
 * action=approve : PENDING -> APPROVED
 * action=reject  : PENDING/APPROVED with nothing allocated -> REJECTED
 * action=reopen  : REJECTED -> PENDING
 * urgency_level / notes may be edited by reviewers or the original requester.
 */
export const PATCH = handler(async ({ req, user, params }) => {
  const id = intParam(params.id);
  const b = await parseBody(req, z.object({
    action: z.enum(["approve", "reject", "reopen"]).optional(),
    urgency_level: z.enum(URGENCY_LEVELS).optional(),
    notes: z.string().trim().max(2000).optional().nullable(),
  }));

  const row = await withTransaction(async (c) => {
    const { rows: [r] } = await c.query("SELECT * FROM relief_requests WHERE request_id = $1 FOR UPDATE", [id]);
    if (!r) throw new HttpError(404, "Request not found");
    const reviewer = can(user.role, "reviewRequests");
    if (!reviewer && r.requested_by !== user.id) throw new HttpError(403, "Not permitted");

    if (b.action) {
      if (!reviewer) throw new HttpError(403, "Only admins and centre managers can review requests");
      if (b.action === "approve") {
        if (r.status !== "PENDING") throw new HttpError(400, `Cannot approve a ${r.status} request`);
        await c.query("UPDATE relief_requests SET status = 'APPROVED' WHERE request_id = $1", [id]);
      } else if (b.action === "reject") {
        if (r.quantity_fulfilled > 0) throw new HttpError(400, "Cancel active allocations before rejecting");
        if (!["PENDING", "APPROVED"].includes(r.status)) throw new HttpError(400, `Cannot reject a ${r.status} request`);
        await c.query("UPDATE relief_requests SET status = 'REJECTED' WHERE request_id = $1", [id]);
      } else if (b.action === "reopen") {
        if (r.status !== "REJECTED") throw new HttpError(400, "Only rejected requests can be reopened");
        await c.query("UPDATE relief_requests SET status = 'PENDING' WHERE request_id = $1", [id]);
      }
    }
    if (b.urgency_level !== undefined || b.notes !== undefined) {
      await c.query(
        `UPDATE relief_requests SET urgency_level = COALESCE($2, urgency_level),
                notes = CASE WHEN $3::boolean THEN $4 ELSE notes END
          WHERE request_id = $1`,
        [id, b.urgency_level ?? null, b.notes !== undefined, b.notes || null]);
    }
    const { rows: [updated] } = await c.query("SELECT * FROM relief_requests WHERE request_id = $1", [id]);
    return updated;
  });

  await Promise.all([syncRequest(id), invalidateKpis()]);
  return { request: row };
});
