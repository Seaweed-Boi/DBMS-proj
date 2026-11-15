import { z } from "zod";
import { handler, intParam, parseBody } from "@/lib/api";
import { updateDispatchStatus } from "@/lib/services/allocation";

export const dynamic = "force-dynamic";

export const PATCH = handler(async ({ req, user, params }) => {
  const id = intParam(params.id);
  const b = await parseBody(req, z.object({ dispatch_status: z.enum(["IN_TRANSIT", "DELIVERED", "CANCELLED"]) }));
  await updateDispatchStatus(user, id, b.dispatch_status);
  return { ok: true };
}, "updateDispatch");
