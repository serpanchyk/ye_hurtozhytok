import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
} from "drizzle-orm";

import { activity, getDb } from "./db";
import { residents, shifts, type Shift } from "./db/schema";
import {
  canEditShift,
  canLeaveShift,
  canStandShift,
  isSquad,
  leadsSquad,
  type Actor,
} from "./permissions";
import { byName } from "./names";
import { idsWithRoles } from "./roles.server";
import {
  NO_DUTY_MESSAGE,
  hasDuty,
  parseShiftForm,
  rankShiftStats,
  type ShiftErrors,
} from "./shifts";
import { addDays, kyivNow } from "./time";

/** Everyone who may stand duty, by name: the squad, its head, the site manager. */
export async function squadPeople(env: Env) {
  const ids = await idsWithRoles(env, ["squad", "squad_head", "site_manager"]);
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

/**
 * The squad, plus anyone a record already names who has left it since, so
 * editing an old shift or patrol never quietly drops them.
 */
export async function squadPeopleWith(env: Env, keep: readonly number[]) {
  const people = await squadPeople(env);
  const gone = keep.filter((id) => !people.some((p) => p.id === id));
  if (gone.length === 0) return people;
  const former = await getDb(env)
    .select({
      id: residents.id,
      name: residents.name,
      telegram: residents.telegram,
    })
    .from(residents)
    .where(inArray(residents.id, gone))
    .all();
  return [...people, ...former].sort(byName);
}

/** The week from its Monday: each day, whether it has duty and its shift. */
export async function weekOfShifts(
  env: Env,
  actor: Actor,
  monday: string,
  today: string,
) {
  const sunday = addDays(monday, 6);
  const rows = await getDb(env)
    .select({ s: shifts, name: residents.name })
    .from(shifts)
    .leftJoin(residents, eq(residents.id, shifts.residentId))
    .where(and(gte(shifts.date, monday), lte(shifts.date, sunday)))
    .all();
  const stand = canStandShift(actor);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    const row = rows.find((r) => r.s.date === date);
    const past = date < today;
    return {
      date,
      past,
      duty: hasDuty(date),
      shift: row
        ? {
            id: row.s.id,
            name: row.name,
            note: row.s.note,
            mine: row.s.residentId === actor.id,
            canSign: row.s.residentId === null && stand && !past,
            canLeave: canLeaveShift(actor, row.s, today) && !past,
            canEdit: canEditShift(actor, row.s, today),
          }
        : null,
    };
  });
}

export async function getShift(env: Env, actor: Actor, id: number) {
  const s = await getDb(env)
    .select()
    .from(shifts)
    .where(eq(shifts.id, id))
    .get();
  return s && canEditShift(actor, s, kyivNow().date) ? s : null;
}

export type ShiftResult =
  { ok: true; date: string } | { ok: false; errors: ShiftErrors };

const TAKEN = "На цей день вахта вже є.";

async function parse(
  env: Env,
  actor: Actor,
  form: FormData,
  keep: number | null = null,
) {
  const people = await squadPeople(env);
  return parseShiftForm(form, {
    me: actor.id,
    leads: leadsSquad(actor),
    allowed: people.map((p) => p.id),
    keep,
    today: kyivNow().date,
  });
}

/** A new shift; the date is unique, so two people never add the same day. */
export async function createShift(
  env: Env,
  actor: Actor,
  form: FormData,
): Promise<ShiftResult | null> {
  if (!isSquad(actor)) return null;
  const parsed = await parse(env, actor, form);
  if (!parsed.ok) return parsed;
  const db = getDb(env);
  const created = await db
    .insert(shifts)
    .values({ ...parsed.values, createdBy: actor.id, createdAt: Date.now() })
    .onConflictDoNothing()
    .returning({ id: shifts.id })
    .get();
  if (!created) return { ok: false, errors: { date: TAKEN } };
  await activity(db, {
    actorId: actor.id,
    action: "shift.created",
    entity: "shift",
    entityId: created.id,
    details: parsed.values,
  });
  return { ok: true, date: parsed.values.date };
}

export async function updateShift(
  env: Env,
  actor: Actor,
  id: number,
  form: FormData,
): Promise<ShiftResult | null> {
  const db = getDb(env);
  const s = await getShift(env, actor, id);
  if (!s) return null;
  const parsed = await parse(env, actor, form, s.residentId);
  if (!parsed.ok) return parsed;
  try {
    await db.update(shifts).set(parsed.values).where(eq(shifts.id, id));
  } catch {
    return { ok: false, errors: { date: TAKEN } };
  }
  await activity(db, {
    actorId: actor.id,
    action: "shift.edited",
    entity: "shift",
    entityId: id,
    details: { before: pick(s), after: parsed.values },
  });
  return { ok: true, date: parsed.values.date };
}

const pick = (s: Shift) => ({
  date: s.date,
  residentId: s.residentId,
  note: s.note,
});

export async function deleteShift(env: Env, actor: Actor, id: number) {
  const db = getDb(env);
  const s = await getShift(env, actor, id);
  if (!s) return null;
  await db.delete(shifts).where(eq(shifts.id, id));
  await activity(db, {
    actorId: actor.id,
    action: "shift.deleted",
    entity: "shift",
    entityId: id,
    details: pick(s),
  });
  return s.date;
}

/** Takes a free shift; only one person gets it if two tap at once. */
export async function signShift(
  env: Env,
  actor: Actor,
  id: number,
): Promise<string | null> {
  if (!canStandShift(actor)) return "Вахти стоїть загін.";
  const db = getDb(env);
  const s = await db.select().from(shifts).where(eq(shifts.id, id)).get();
  if (!s) return "Такої вахти немає.";
  if (!hasDuty(s.date)) return NO_DUTY_MESSAGE;
  if (s.date < kyivNow().date) return "Ця вахта вже минула.";
  const taken = await db
    .update(shifts)
    .set({ residentId: actor.id })
    .where(and(eq(shifts.id, id), isNull(shifts.residentId)))
    .returning({ id: shifts.id })
    .get();
  if (!taken) return "Цю вахту вже хтось узяв.";
  await activity(db, {
    actorId: actor.id,
    action: "shift.signed",
    entity: "shift",
    entityId: id,
  });
  return null;
}

/** «Не зможу»: the shift becomes free again. */
export async function leaveShift(
  env: Env,
  actor: Actor,
  id: number,
): Promise<string | null> {
  const db = getDb(env);
  const s = await db.select().from(shifts).where(eq(shifts.id, id)).get();
  if (!s || !canLeaveShift(actor, s, kyivNow().date))
    return "Звільнити цю вахту не можна.";
  await db.update(shifts).set({ residentId: null }).where(eq(shifts.id, id));
  await activity(db, {
    actorId: actor.id,
    action: "shift.left",
    entity: "shift",
    entityId: id,
    details: { residentId: s.residentId },
  });
  return null;
}

/**
 * Past shifts (days before today) of everyone who stands duty, people with
 * none yet included, ranked.
 */
export async function shiftStats(env: Env, today: string) {
  const monthStart = `${today.slice(0, 8)}01`;
  const [people, past] = await Promise.all([
    squadPeople(env),
    getDb(env)
      .select({ residentId: shifts.residentId, date: shifts.date })
      .from(shifts)
      .where(and(isNotNull(shifts.residentId), lt(shifts.date, today)))
      .all(),
  ]);
  return rankShiftStats(
    people.map((p) => {
      const own = past.filter((s) => s.residentId === p.id);
      return {
        ...p,
        total: own.length,
        month: own.filter((s) => s.date >= monthStart).length,
      };
    }),
  );
}
