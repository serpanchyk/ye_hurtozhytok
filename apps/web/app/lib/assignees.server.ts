import { asc, eq, inArray } from "drizzle-orm";

import type { Db } from "./db";
import { residents, taskAssignees } from "./db/schema";

type Person = { id: number; name: string };

/** People working on each of the given cards, alphabetically. */
export async function assigneesOf(
  db: Db,
  taskIds: number[],
): Promise<Map<number, Person[]>> {
  const result = new Map<number, Person[]>(taskIds.map((id) => [id, []]));
  if (taskIds.length === 0) return result;
  const rows = await db
    .select({
      taskId: taskAssignees.taskId,
      id: residents.id,
      name: residents.name,
    })
    .from(taskAssignees)
    .innerJoin(residents, eq(residents.id, taskAssignees.residentId))
    .where(inArray(taskAssignees.taskId, taskIds))
    .orderBy(asc(residents.name))
    .all();
  for (const { taskId, ...person } of rows) result.get(taskId)?.push(person);
  return result;
}
