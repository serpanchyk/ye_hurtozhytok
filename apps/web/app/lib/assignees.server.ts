import { and, eq, inArray } from "drizzle-orm";

import { getDb, inSlices, type Db } from "./db";
import { residents, taskAssignees, type Board } from "./db/schema";
import { byName } from "./names";
import { BOARD_KEEPERS } from "./permissions";
import { idsWithRoles } from "./roles.server";

/** Everyone who keeps a board, by name: those a card on it can be given to. */
export async function boardPeople(env: Env, board: Board) {
  const ids = await idsWithRoles(env, BOARD_KEEPERS[board]);
  if (ids.length === 0) return [];
  const people = await getDb(env)
    .select({
      id: residents.id,
      name: residents.name,
      telegram: residents.telegram,
    })
    .from(residents)
    .where(and(inArray(residents.id, ids), eq(residents.blocked, false)))
    .all();
  return people.sort(byName);
}

type Person = { id: number; name: string };

/** People working on each of the given cards, alphabetically. */
export async function assigneesOf(
  db: Db,
  taskIds: number[],
): Promise<Map<number, Person[]>> {
  const result = new Map<number, Person[]>(taskIds.map((id) => [id, []]));
  if (taskIds.length === 0) return result;
  const rows = await inSlices(taskIds, (slice) =>
    db
      .select({
        taskId: taskAssignees.taskId,
        id: residents.id,
        name: residents.name,
      })
      .from(taskAssignees)
      .innerJoin(residents, eq(residents.id, taskAssignees.residentId))
      .where(inArray(taskAssignees.taskId, slice))
      .all(),
  );
  for (const { taskId, ...person } of rows) result.get(taskId)?.push(person);
  for (const people of result.values()) people.sort(byName);
  return result;
}
