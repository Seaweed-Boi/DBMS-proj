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

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof ZodError) {
    const msg = err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const e = err as { code?: string; message?: string; status?: number; detail?: string };
  if (e?.status) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e?.code && PG_STATUS[e.code]) {
    return NextResponse.json({ error: e.detail ? `${e.message} — ${e.detail}` : e.message }, { status: PG_STATUS[e.code] });
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
