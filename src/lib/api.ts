import { NextResponse } from "next/server";
import { ZodError, ZodSchema } from "zod";
import { getCurrentUser, SessionUser } from "./auth";
import { can, Permission } from "./constants";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// PostgreSQL SQLSTATE -> HTTP status
const PG_STATUS: Record<string, number> = {
  "23505": 409, // unique_violation
  "23503": 400, // foreign_key_violation
  "23514": 400, // check_violation
  "23502": 400, // not_null_violation
  "22P02": 400, // invalid_text_representation
  "P0002": 404, // no_data_found
  "40001": 409, // serialization_failure
  "40P01": 409, // deadlock_detected
  "42501": 403, // insufficient_privilege
};

// Friendly messages for named constraints (fallback: PostgreSQL's own message).
const CONSTRAINT_MESSAGES: Record<string, string> = {
  centre_occupancy_bounds: "Occupancy must be between 0 and the centre's total capacity",
  request_fulfilment_bounds: "Fulfilled quantity cannot exceed the requested quantity",
  centre_inventory_batch_unique: "A batch with this centre, item and expiry date already exists",
  users_email_key: "An account with this email already exists",
  relief_centres_centre_name_key: "A centre with this name already exists",
  resource_items_sku_key: "An item with this SKU already exists",
  resource_categories_category_name_key: "A category with this name already exists",
  affected_zones_disaster_id_zone_name_key: "This disaster already has a zone with that name",
};

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof ZodError) {
    const msg = err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const e = err as { code?: string; message?: string; status?: number; detail?: string };
  if (e?.status) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e?.code && PG_STATUS[e.code]) {
    const constraint = (err as { constraint?: string }).constraint;
    const message = (constraint && CONSTRAINT_MESSAGES[constraint])
      ?? (e.code === "23503" ? `Referenced record is missing or still in use — ${e.detail ?? e.message}` : e.message);
    return NextResponse.json({ error: message }, { status: PG_STATUS[e.code] });
  }
  console.error(err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

type Ctx = { params: Promise<Record<string, string>> };
type Handler = (args: { req: Request; user: SessionUser; params: Record<string, string> }) => Promise<unknown>;

/**
 * Wrap a route handler with authentication, RBAC and uniform error mapping.
 * `permission` omitted => any signed-in user.
 */
export function handler(fn: Handler, permission?: Permission) {
  return async (req: Request, ctx: Ctx) => {
    try {
      const user = await getCurrentUser();
      if (!user) throw new HttpError(401, "Not signed in");
      if (permission && !can(user.role, permission)) throw new HttpError(403, "Your role is not permitted to do this");
      const result = await fn({ req, user, params: (await ctx?.params) ?? {} });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new HttpError(400, "Request body must be JSON");
  }
  return schema.parse(json);
}

export function intParam(value: string | undefined, name = "id"): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `Invalid ${name}`);
  return n;
}
