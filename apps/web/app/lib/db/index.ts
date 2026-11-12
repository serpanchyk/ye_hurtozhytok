import { drizzle } from "drizzle-orm/d1";

import { activityLog } from "./schema";
import * as schema from "./schema";

export function getDb(env: Env) {
  return drizzle(env.DB, { schema });
}

export type Db = ReturnType<typeof getDb>;

/** D1 binds at most 100 values a query, so long id lists go in slices. */
export async function inSlices<T>(
  ids: readonly number[],
  run: (slice: number[]) => Promise<T[]>,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 90)
    out.push(...(await run(ids.slice(i, i + 90))));
  return out;
}

export type ActivityAction =
  | "booking.created"
  | "booking.cancelled"
  | "booking.released"
  | "resident.joined"
  | "resident.profile"
  | "resident.blocked"
  | "resident.unblocked"
  | "role.granted"
  | "role.revoked"
  | "announcement.proposed"
  | "announcement.published"
  | "announcement.rejected"
  | "announcement.updated"
  | "announcement.deleted"
  | "task.created"
  | "task.updated"
  | "task.status"
  | "task.taken"
  | "task.left"
  | "task.moved"
  | "task.deleted"
  | "complaint.created"
  | "complaint.answered"
  | "complaint.rejected"
  | "complaint.resolved"
  | "complaint.deleted"
  | "shift.created"
  | "shift.edited"
  | "shift.signed"
  | "shift.left"
  | "shift.deleted"
  | "patrol.recorded"
  | "patrol.planned"
  | "patrol.edited"
  | "patrol.deleted"
  | "telegram.connected"
  | "telegram.disconnected";

export function activity(
  db: Db,
  entry: {
    actorId: number;
    action: ActivityAction;
    entity:
      | "booking"
      | "resident"
      | "role_grant"
      | "announcement"
      | "task"
      | "complaint"
      | "shift"
      | "patrol"
      | "telegram";
    entityId: number;
    details?: Record<string, unknown>;
  },
) {
  return db.insert(activityLog).values({
    actorId: entry.actorId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    details: entry.details ? JSON.stringify(entry.details) : null,
    createdAt: Date.now(),
  });
}
