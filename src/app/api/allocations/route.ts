import { z } from "zod";
import { handler, parseBody } from "@/lib/api";
import { DISPATCH_STATUSES } from "@/lib/constants";
import { listAllocations } from "@/lib/queries";
import { allocate } from "@/lib/services/allocation";

export const dynamic = "force-dynamic";

export const GET = handler(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  return {
    allocations: await listAllocations({
      status: status && (DISPATCH_STATUSES as readonly string[]).includes(status) ? status : undefined,
      centreId: sp.get("centre_id") ? Number(sp.get("centre_id")) : undefined,
      requestId: sp.get("request_id") ? Number(sp.get("request_id")) : undefined,
    }),
  };
});

/** Atomic FEFO allocation (Redis lock + PostgreSQL transaction). */
export const POST = handler(async ({ req, user }) => {
  const b = await parseBody(req, z.object({
    request_id: z.coerce.number().int().positive(),
    centre_id: z.coerce.number().int().positive(),
    quantity: z.coerce.number().int().positive(),
  }));
  const allocationId = await allocate(user, b.request_id, b.centre_id, b.quantity);
  return { allocation_id: allocationId };
}, "allocate");
