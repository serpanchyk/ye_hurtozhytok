import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";

import { activity, getDb } from "./db";
import { patrolMembers, patrols, residents, tasks } from "./db/schema";
import { canEditPatrol, isSquad, type Actor } from "./permissions";
import {
  parsePatrolForm,
  taskTitleFromNotes,
  type PatrolErrors,
} from "./patrols";
import { squadPeople } from "./shifts.server";
import { addDays } from "./time";

/** Patrols of the week from its Monday, with who went or goes. */
export async function weekPatrols(env: Env, actor: Actor, monday: string) {
  const db = getDb(env);
  const rows = await db
    .select()
    .from(patrols)
    .where(
      and(gte(patrols.date, monday), lte(patrols.date, addDays(monday, 6))),
    )
    .orderBy(asc(patrols.date), asc(patrols.createdAt))
    .all();
  const people = rows.length
    ? await db
        .select({ patrolId: patrolMembers.patrolId, name: residents.name })
        .from(patrolMembers)
        .innerJoin(residents, eq(residents.id, patrolMembers.residentId))
        .where(
          inArray(
            patrolMembers.patrolId,
            rows.map((p) => p.id),
          ),
        )
        .orderBy(asc(residents.name))
        .all()
    : [];
  return rows.map((p) => ({
    id: p.id,
    date: p.date,
    planned: p.status === "planned",
    notes: p.notes,
    people: people.filter((x) => x.patrolId === p.id).map((x) => x.name),
    canEdit: canEditPatrol(actor, p),
  }));
}

export async function getPatrol(env: Env, actor: Actor, id: number) {
  const db = getDb(env);
  const p = await db.select().from(patrols).where(eq(patrols.id, id)).get();
  if (!p || !canEditPatrol(actor, p)) return null;
  const members = await db
    .select({ id: patrolMembers.residentId })
    .from(patrolMembers)
    .where(eq(patrolMembers.patrolId, id))
    .all();
  return { ...p, people: members.map((m) => m.id) };
}

export type PatrolResult =
  | { ok: true; date: string; taskId: number | null }
  | { ok: false; errors: PatrolErrors };

async function parse(env: Env, form: FormData) {
  const people = await squadPeople(env);
  return parsePatrolForm(
    form,
    people.map((p) => p.id),
  );
}

/**
 * Records a patrol (or plans one). After a patrol, «Створити картку з
 * нотатки» puts a private card on the squad's working board, linked to it.
 */
export async function createPatrol(
  env: Env,
  actor: Actor,
  form: FormData,
): Promise<PatrolResult | null> {
  if (!isSquad(actor)) return null;
  const parsed = await parse(env, form);
  if (!parsed.ok) return parsed;
  const { date, status, notes, people } = parsed.values;
  const card = status === "done" && form.get("card") === "on";
  if (card && !notes)
    return {
      ok: false,
      errors: { notes: "Щоб створити картку, опишіть, що помітили." },
    };
  const db = getDb(env);
  const now = Date.now();
  const p = await db
    .insert(patrols)
    .values({ date, status, notes, createdBy: actor.id, createdAt: now })
    .returning({ id: patrols.id })
    .get();
  await db
    .insert(patrolMembers)
    .values(people.map((residentId) => ({ patrolId: p.id, residentId })));
  await activity(db, {
    actorId: actor.id,
    action: status === "done" ? "patrol.recorded" : "patrol.planned",
    entity: "patrol",
    entityId: p.id,
    details: { date, people },
  });
  let taskId: number | null = null;
  if (card && notes) {
    const title = taskTitleFromNotes(notes);
    const t = await db
      .insert(tasks)
      .values({
        board: "squad",
        title,
        details: notes,
        public: false,
        patrolId: p.id,
        createdBy: actor.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: tasks.id })
      .get();
    taskId = t.id;
    await activity(db, {
      actorId: actor.id,
      action: "task.created",
      entity: "task",
      entityId: t.id,
      details: { title, board: "squad", patrol: p.id },
    });
  }
  return { ok: true, date, taskId };
}

export async function updatePatrol(
  env: Env,
  actor: Actor,
  id: number,
  form: FormData,
): Promise<PatrolResult | null> {
  const p = await getPatrol(env, actor, id);
  if (!p) return null;
  const parsed = await parse(env, form);
  if (!parsed.ok) return parsed;
  const { date, status, notes, people } = parsed.values;
  const db = getDb(env);
  await db
    .update(patrols)
    .set({ date, status, notes })
    .where(eq(patrols.id, id));
  await db.delete(patrolMembers).where(eq(patrolMembers.patrolId, id));
  await db
    .insert(patrolMembers)
    .values(people.map((residentId) => ({ patrolId: id, residentId })));
  await activity(db, {
    actorId: actor.id,
    action: "patrol.edited",
    entity: "patrol",
    entityId: id,
    details: { date, status, people },
  });
  return { ok: true, date, taskId: null };
}

/** Removes a patrol; a card made from it stays on the board. */
export async function deletePatrol(env: Env, actor: Actor, id: number) {
  const p = await getPatrol(env, actor, id);
  if (!p) return null;
  const db = getDb(env);
  await db.update(tasks).set({ patrolId: null }).where(eq(tasks.patrolId, id));
  await db.delete(patrolMembers).where(eq(patrolMembers.patrolId, id));
  await db.delete(patrols).where(eq(patrols.id, id));
  await activity(db, {
    actorId: actor.id,
    action: "patrol.deleted",
    entity: "patrol",
    entityId: id,
    details: { date: p.date, notes: p.notes },
  });
  return p.date;
}

/** The day of the patrol a card was made from, for the card's page. */
export async function patrolDateOf(env: Env, patrolId: number | null) {
  if (!patrolId) return null;
  const p = await getDb(env)
    .select({ date: patrols.date })
    .from(patrols)
    .where(eq(patrols.id, patrolId))
    .get();
  return p?.date ?? null;
}
