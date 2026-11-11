import {
  and,
  asc,
  count,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lte,
  max,
  ne,
} from "drizzle-orm";

import { fmtMin } from "./booking";
import { getDb } from "./db";
import {
  activityLog,
  announcements,
  patrols,
  residents,
  settings,
  shifts,
  taskAssignees,
  tasks,
  type TaskStatus,
} from "./db/schema";
import { shiftStats } from "./shifts.server";
import { getSetting, setSetting } from "./settings.server";
import {
  cardStatusMessage,
  cardTakenMessage,
  cardToCouncilMessage,
  displayName,
  freeShiftMessage,
  morningMessage,
  newCardMessage,
  patrolMessage,
  shiftEventMessage,
  shiftTopMessage,
  weekScheduleMessage,
  worthPosting,
  type DayShift,
} from "./squad-news";
import { postToSquad, squadChat, type TelegramChat } from "./telegram.server";
import { addDays, kyivDateKey, kyivMinute, weekdayIndex } from "./time";

/**
 * The squad's news in its Telegram group. Every change already writes an
 * activity_log entry, so the bot reads the log once a minute and posts what
 * concerns the squad; nothing has to remember to notify it. At 09:00 it sends
 * the morning summary, at 18:00 the free-shift reminder, on Sundays also the
 * coming week and who has sat how many shifts.
 */

/** The last activity_log id already read. */
const SETTING_CURSOR = "telegram.cursor";
/** The days the daily messages went out: { morning, evening }. */
const SETTING_SENT = "telegram.sent";

const MORNING = 9 * 60;
const EVENING = 18 * 60;
const SUNDAY = 6;
/** Log entries read a minute; Telegram lets a bot post about 20 a minute to a group. */
const BATCH = 40;

export async function runSquadBot(env: Env, scheduledTime: number) {
  const chat = await squadChat(env);
  if (!chat) return;
  await postNews(env, chat);
  await postDaily(env, chat, scheduledTime);
}

/** From now on: the log written before is never posted. */
export async function readNewsFromNow(env: Env) {
  const row = await getDb(env)
    .select({ id: max(activityLog.id) })
    .from(activityLog)
    .get();
  await setSetting(env, SETTING_CURSOR, row?.id ?? 0);
}

/**
 * Moves a JSON setting from `from` to `to` only if nobody did it first, so
 * two runs that overlap never post the same thing twice.
 */
async function claim(env: Env, key: string, from: unknown, to: unknown) {
  const done = await getDb(env)
    .update(settings)
    .set({ value: JSON.stringify(to), updatedAt: Date.now() })
    .where(and(eq(settings.key, key), eq(settings.value, JSON.stringify(from))))
    .returning({ key: settings.key });
  return done.length > 0;
}

// ─── News from the activity log ──────────────────────────────────────────

type Entry = typeof activityLog.$inferSelect;
type Details = Record<string, unknown>;

async function postNews(env: Env, chat: TelegramChat) {
  const cursor = await getSetting<number>(env, SETTING_CURSOR);
  if (cursor === null) return readNewsFromNow(env);
  const db = getDb(env);
  const read = await db
    .select()
    .from(activityLog)
    .where(gt(activityLog.id, cursor))
    .orderBy(asc(activityLog.id))
    .limit(BATCH)
    .all();
  if (read.length === 0) return;
  if (!(await claim(env, SETTING_CURSOR, cursor, read.at(-1)!.id))) return;
  const entries = read.filter((e) =>
    ["task", "shift", "patrol"].includes(e.entity),
  );
  if (entries.length === 0) return;

  const facts = await gather(env, entries);
  for (const entry of entries) {
    const text = newsFor(entry, facts, env.APP_URL);
    if (text) await postToSquad(env, chat, text);
  }
}

const detailsOf = (e: Entry): Details =>
  e.details ? (JSON.parse(e.details) as Details) : {};
const num = (v: unknown) => (typeof v === "number" ? v : null);
const str = (v: unknown) => (typeof v === "string" ? v : null);

/** Everything the entries refer to, read in a few queries. */
async function gather(env: Env, entries: Entry[]) {
  const db = getDb(env);
  const ids = (entity: string) => [
    ...new Set(
      entries.filter((e) => e.entity === entity).map((e) => e.entityId),
    ),
  ];
  const taskIds = ids("task");
  const shiftIds = ids("shift");
  const patrolIds = ids("patrol");

  const people = new Set(entries.map((e) => e.actorId));
  for (const e of entries) {
    const d = detailsOf(e);
    const before = (d.before ?? {}) as Details;
    const after = (d.after ?? {}) as Details;
    for (const v of [d.residentId, before.residentId, after.residentId])
      if (typeof v === "number") people.add(v);
    if (Array.isArray(d.people))
      for (const v of d.people) if (typeof v === "number") people.add(v);
  }

  const [names, cardRows, helpers, shiftRows, patrolRows] = await Promise.all([
    db
      .select({
        id: residents.id,
        name: residents.name,
        telegram: residents.telegram,
      })
      .from(residents)
      .where(inArray(residents.id, [...people]))
      .all(),
    taskIds.length
      ? db.select().from(tasks).where(inArray(tasks.id, taskIds)).all()
      : [],
    taskIds.length
      ? db
          .select({ taskId: taskAssignees.taskId, n: count() })
          .from(taskAssignees)
          .where(inArray(taskAssignees.taskId, taskIds))
          .groupBy(taskAssignees.taskId)
          .all()
      : [],
    shiftIds.length
      ? db.select().from(shifts).where(inArray(shifts.id, shiftIds)).all()
      : [],
    patrolIds.length
      ? db.select().from(patrols).where(inArray(patrols.id, patrolIds)).all()
      : [],
  ]);
  const byId = new Map(names.map((p) => [p.id, displayName(p)]));
  return {
    name: (id: number | null) =>
      id === null ? null : (byId.get(id) ?? "Хтось"),
    card: new Map(cardRows.map((t) => [t.id, t])),
    helpers: new Map(helpers.map((h) => [h.taskId, h.n])),
    shift: new Map(shiftRows.map((s) => [s.id, s])),
    patrol: new Map(patrolRows.map((p) => [p.id, p])),
  };
}

type Facts = Awaited<ReturnType<typeof gather>>;

/** The message for one log entry, or null when the squad need not hear of it. */
function newsFor(e: Entry, f: Facts, url: string): string | null {
  const d = detailsOf(e);
  const actor = f.name(e.actorId) ?? "Хтось";
  const today = kyivDateKey(e.createdAt);

  if (e.entity === "task") {
    const t = f.card.get(e.entityId);
    if (!t) return null;
    if (e.action === "task.moved") {
      if (d.to === "squad")
        return newCardMessage(url, {
          ...t,
          authorName: actor,
          origin: "council",
        });
      if (d.from === "squad")
        return cardToCouncilMessage(url, { ...t, movedBy: actor });
      return null;
    }
    // Only the squad's own board; the council's has no group here.
    if (t.board !== "squad") return null;
    switch (e.action) {
      case "task.created": {
        const origin = d.complaint
          ? "complaint"
          : d.patrol
            ? "patrol"
            : "board";
        return newCardMessage(url, {
          ...t,
          authorName: origin === "complaint" ? null : actor,
          origin,
        });
      }
      case "task.taken":
        return cardTakenMessage(url, {
          ...t,
          takenBy: actor,
          others: Math.max(0, (f.helpers.get(t.id) ?? 1) - 1),
        });
      case "task.status":
        return cardStatusMessage(url, {
          ...t,
          from: str(d.from) as TaskStatus | null,
          to: str(d.status) as TaskStatus,
          changedBy: actor,
        });
      default:
        return null;
    }
  }

  if (e.entity === "shift") {
    const now = f.shift.get(e.entityId);
    switch (e.action) {
      case "shift.created":
      case "shift.deleted": {
        const date = str(d.date);
        if (!date) return null;
        const who = num(d.residentId);
        const kind = e.action === "shift.created" ? "created" : "deleted";
        if (!worthPosting({ kind, date, who }, today)) return null;
        return shiftEventMessage(url, {
          kind,
          date,
          name: f.name(who),
          note: str(d.note),
          actorName: actor,
        });
      }
      case "shift.edited": {
        const before = (d.before ?? {}) as Details;
        const after = (d.after ?? {}) as Details;
        const date = str(after.date);
        const previousDate = str(before.date);
        if (!date || !previousDate) return null;
        const who = num(after.residentId);
        const previousWho = num(before.residentId);
        const change = {
          kind: "edited" as const,
          date,
          previousDate,
          who,
          previousWho,
        };
        if (!worthPosting(change, today)) return null;
        return shiftEventMessage(url, {
          ...change,
          name: f.name(who),
          previousName: f.name(previousWho),
          note: str(after.note),
          actorName: actor,
        });
      }
      case "shift.signed":
        if (!now) return null;
        return shiftEventMessage(url, {
          kind: "signed",
          date: now.date,
          name: actor,
          note: now.note,
        });
      case "shift.left":
        if (!now) return null;
        return shiftEventMessage(url, {
          kind: "freed",
          date: now.date,
          previousName: f.name(num(d.residentId)) ?? actor,
          note: now.note,
          actorName: actor,
        });
      default:
        return null;
    }
  }

  if (e.entity === "patrol") {
    const p = f.patrol.get(e.entityId);
    const date = str(d.date);
    if (!p || !date || e.action === "patrol.deleted") return null;
    const people = Array.isArray(d.people)
      ? d.people.map((id) => f.name(num(id)) ?? "Хтось")
      : [];
    const planned =
      e.action === "patrol.edited"
        ? d.status === "planned"
        : e.action === "patrol.planned";
    return patrolMessage(url, {
      date,
      planned,
      edited: e.action === "patrol.edited",
      people,
      notes: p.notes,
      authorName: actor,
    });
  }
  return null;
}

// ─── The daily messages ──────────────────────────────────────────────────

type Sent = { morning?: string; evening?: string };

async function postDaily(env: Env, chat: TelegramChat, at: number) {
  const minute = kyivMinute(at);
  // Within the hour only: a cron that was down does not post stale news later.
  const morning = minute >= MORNING && minute < MORNING + 60;
  const evening = minute >= EVENING && minute < EVENING + 60;
  if (!morning && !evening) return;
  const today = kyivDateKey(at);
  // The row has to exist before it can be claimed.
  await getDb(env)
    .insert(settings)
    .values({ key: SETTING_SENT, value: "{}", updatedAt: Date.now() })
    .onConflictDoNothing();
  const sent = (await getSetting<Sent>(env, SETTING_SENT)) ?? {};
  const which = morning ? "morning" : "evening";
  if (sent[which] === today) return;
  if (!(await claim(env, SETTING_SENT, sent, { ...sent, [which]: today })))
    return;

  const url = env.APP_URL;
  if (morning) {
    await postToSquad(
      env,
      chat,
      morningMessage(url, await morningFacts(env, today)),
    );
    return;
  }
  const [day] = await daysOf(env, today, today);
  const reminder = freeShiftMessage(url, day);
  if (reminder) await postToSquad(env, chat, reminder);
  if (weekdayIndex(today) === SUNDAY) {
    const monday = addDays(today, 1);
    await postToSquad(
      env,
      chat,
      weekScheduleMessage(url, await daysOf(env, monday, addDays(monday, 6))),
    );
    await postToSquad(env, chat, await shiftTopText(env, today));
  }
}

/** «Хто скільки відсидів» for the group; also sent from the bot's page. */
export async function shiftTopText(env: Env, today: string) {
  return shiftTopMessage(env.APP_URL, await shiftStats(env, today));
}

/** Each day from `from` to `to` with its shift, if any. */
async function daysOf(env: Env, from: string, to: string): Promise<DayShift[]> {
  const rows = await getDb(env)
    .select({
      date: shifts.date,
      note: shifts.note,
      name: residents.name,
      telegram: residents.telegram,
    })
    .from(shifts)
    .leftJoin(residents, eq(residents.id, shifts.residentId))
    .where(and(gte(shifts.date, from), lte(shifts.date, to)))
    .all();
  const days: DayShift[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const s = rows.find((r) => r.date === date);
    days.push({
      date,
      shift: s
        ? {
            name: s.name
              ? displayName({ name: s.name, telegram: s.telegram })
              : null,
            note: s.note,
          }
        : null,
    });
  }
  return days;
}

async function morningFacts(env: Env, today: string) {
  const db = getDb(env);
  const open = and(eq(tasks.board, "squad"), isNull(tasks.deletedAt));
  const [[day, tomorrow], openCards, newCards, events] = await Promise.all([
    daysOf(env, today, addDays(today, 1)),
    db
      .select({ n: count() })
      .from(tasks)
      .where(and(open, ne(tasks.status, "done")))
      .get(),
    db
      .select({ n: count() })
      .from(tasks)
      .where(and(open, eq(tasks.status, "new")))
      .get(),
    db
      .select({ title: announcements.title, startMin: announcements.startMin })
      .from(announcements)
      .where(
        and(
          eq(announcements.date, today),
          eq(announcements.status, "published"),
          isNull(announcements.deletedAt),
        ),
      )
      .orderBy(asc(announcements.startMin))
      .all(),
  ]);
  return {
    today: day,
    tomorrow,
    events: events.map((a) => ({
      title: a.title,
      time: a.startMin === null ? null : fmtMin(a.startMin),
    })),
    openCards: openCards?.n ?? 0,
    newCards: newCards?.n ?? 0,
  };
}
