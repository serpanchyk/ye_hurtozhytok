import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";

import { getDb } from "./db";
import {
  activityLog,
  patrolMembers,
  patrols,
  residents,
  shifts,
  taskAssignees,
  tasks,
} from "./db/schema";
import {
  ACTION_TEXT,
  ENTITY_TEXT,
  PATROL_STATUS_TEXT,
  dateCell,
  dayText,
  describeDetails,
  momentCell,
} from "./export";
import { shiftStats } from "./shifts.server";
import { STATUS_LABELS } from "./tasks";
import { WEEKDAYS_SHORT, weekdayIndex } from "./time";
import { buildXlsx, type Sheet } from "./xlsx";

/** Names joined for a list of rows grouped by `key`. */
function grouped(rows: { key: number; name: string }[]): Map<number, string> {
  const map = new Map<number, string[]>();
  for (const r of rows) map.set(r.key, [...(map.get(r.key) ?? []), r.name]);
  return new Map(
    [...map].map(([k, v]) => [
      k,
      v.sort((a, b) => a.localeCompare(b, "uk")).join(", "),
    ]),
  );
}

/**
 * Everything the squad has recorded, one sheet per kind, as an .xlsx file:
 * shifts, patrols, the squad board's cards, the squad and the change log.
 */
export async function squadWorkbook(
  env: Env,
  today: string,
): Promise<Uint8Array> {
  const db = getDb(env);
  const [people, shiftRows, patrolRows, patrolPeople, taskRows] =
    await Promise.all([
      db
        .select({ id: residents.id, name: residents.name })
        .from(residents)
        .all(),
      db.select().from(shifts).orderBy(asc(shifts.date)).all(),
      db
        .select()
        .from(patrols)
        .orderBy(asc(patrols.date), asc(patrols.id))
        .all(),
      db
        .select({ key: patrolMembers.patrolId, name: residents.name })
        .from(patrolMembers)
        .innerJoin(residents, eq(residents.id, patrolMembers.residentId))
        .all(),
      db
        .select()
        .from(tasks)
        .where(and(eq(tasks.board, "squad"), isNull(tasks.deletedAt)))
        .orderBy(asc(tasks.id))
        .all(),
    ]);
  // The same cards as a subquery: an id list would outgrow D1's 100 bound values.
  const squadCards = and(eq(tasks.board, "squad"), isNull(tasks.deletedAt));
  const [assignees, log, stats] = await Promise.all([
    db
      .select({ key: taskAssignees.taskId, name: residents.name })
      .from(taskAssignees)
      .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
      .innerJoin(residents, eq(residents.id, taskAssignees.residentId))
      .where(squadCards)
      .all(),
    db
      .select()
      .from(activityLog)
      .where(
        or(
          inArray(activityLog.entity, ["shift", "patrol"]),
          and(
            eq(activityLog.entity, "task"),
            inArray(
              activityLog.entityId,
              db.select({ id: tasks.id }).from(tasks).where(squadCards),
            ),
          ),
        ),
      )
      .orderBy(desc(activityLog.createdAt))
      .all(),
    shiftStats(env, today),
  ]);

  const names = new Map(people.map((p) => [p.id, p.name]));
  const nameOf = (id: number | null) =>
    id === null ? null : (names.get(id) ?? `№${id}`);
  const teams = grouped(patrolPeople);
  const workers = grouped(assignees);
  const patrolDates = new Map(patrolRows.map((p) => [p.id, p.date]));
  const subjects: Record<string, Map<number, string>> = {
    shift: new Map(shiftRows.map((s) => [s.id, `вахта ${dayText(s.date)}`])),
    patrol: new Map(patrolRows.map((p) => [p.id, `обхід ${dayText(p.date)}`])),
    task: new Map(taskRows.map((t) => [t.id, t.title])),
  };

  const sheets: Sheet[] = [
    {
      name: "Вахти",
      columns: [
        { title: "Дата", width: 12 },
        { title: "День", width: 6 },
        { title: "На вахті", width: 24 },
        { title: "Примітка", width: 40 },
        { title: "Хто додав", width: 24 },
        { title: "Додано", width: 17 },
      ],
      rows: shiftRows.map((s) => [
        dateCell(s.date),
        WEEKDAYS_SHORT[weekdayIndex(s.date)],
        nameOf(s.residentId) ?? "вільна",
        s.note,
        nameOf(s.createdBy),
        momentCell(s.createdAt),
      ]),
    },
    {
      name: "Обходи",
      columns: [
        { title: "Дата", width: 12 },
        { title: "Стан", width: 10 },
        { title: "Учасники", width: 40 },
        { title: "Нотатка", width: 50 },
        { title: "Хто записав", width: 24 },
        { title: "Записано", width: 17 },
      ],
      rows: patrolRows.map((p) => [
        dateCell(p.date),
        PATROL_STATUS_TEXT[p.status],
        teams.get(p.id) ?? "",
        p.notes,
        nameOf(p.createdBy),
        momentCell(p.createdAt),
      ]),
    },
    {
      name: "Картки",
      columns: [
        { title: "№", width: 6 },
        { title: "Назва", width: 36 },
        { title: "Стан", width: 10 },
        { title: "Публічна", width: 9 },
        { title: "Виконавці", width: 36 },
        { title: "Місце", width: 18 },
        { title: "Подробиці", width: 50 },
        { title: "З обходу", width: 12 },
        { title: "Хто додав", width: 24 },
        { title: "Додано", width: 17 },
        { title: "Остання зміна", width: 17 },
      ],
      rows: taskRows.map((t) => [
        t.id,
        t.title,
        STATUS_LABELS[t.status],
        t.public ? "так" : "ні",
        workers.get(t.id) ?? "",
        t.place,
        t.details,
        t.patrolId === null
          ? null
          : dateCell(patrolDates.get(t.patrolId) ?? null),
        nameOf(t.createdBy),
        momentCell(t.createdAt),
        momentCell(t.updatedAt),
      ]),
    },
    {
      name: "Загін",
      columns: [
        { title: "Імʼя", width: 24 },
        { title: "Нік у Telegram", width: 18 },
        { title: "Відсиджено вахт", width: 16 },
        { title: "З початку місяця", width: 16 },
      ],
      rows: stats.map((p) => [p.name, p.telegram, p.total, p.month]),
    },
    {
      name: "Журнал змін",
      columns: [
        { title: "Коли", width: 17 },
        { title: "Хто", width: 24 },
        { title: "Що зроблено", width: 28 },
        { title: "Розділ", width: 12 },
        { title: "Про що", width: 32 },
        { title: "Подробиці", width: 60 },
      ],
      rows: log.map((e) => [
        momentCell(e.createdAt),
        nameOf(e.actorId),
        ACTION_TEXT[e.action] ?? e.action,
        ENTITY_TEXT[e.entity] ?? e.entity,
        subjects[e.entity]?.get(e.entityId) ?? `№${e.entityId}`,
        describeDetails(e.details, names, e.entity),
      ]),
    },
  ];
  return buildXlsx(sheets);
}
