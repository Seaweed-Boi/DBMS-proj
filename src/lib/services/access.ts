import { queryOne, Queryable, pool } from "../db";
import { HttpError } from "../api";
import type { SessionUser } from "../auth";

/** Centre managers may only act on centres they manage; admins on any centre. */
export async function assertCentreAccess(user: SessionUser, centreId: number, client: Queryable = pool) {
  if (user.role === "ADMIN") return;
  const row = await queryOne("SELECT 1 FROM relief_centres WHERE centre_id = $1 AND manager_id = $2", [centreId, user.id], client);
  if (!row) throw new HttpError(403, "You can only manage relief centres assigned to you");
}
