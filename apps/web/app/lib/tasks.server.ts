import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";

import { assigneesOf } from "./assignees.server";
import { isComplaintCard } from "./complaints.server";
import { activity, getDb, type Db } from "./db";
import {
  activityLog,
  residents,
  taskAssignees,
  tasks,
  type Task,
} from "./db/schema";
import {
  canDeleteTask,
  canManageBoard,
  canSeeTask,
  type Actor,
} from "./permissions";
import {
  DONE_LIMIT,
  defaultPublic,
  historyLabel,
  otherBoard,
  parseTaskForm,
  type Board,
  type TaskErrors,
  type TaskStatus,
} from "./tasks";

/**
 * A board's cards with who works on them: the public view (public cards
 * only, the same for everyone) or the working view in the work pages (every card,
 * only for those who keep the board; null for anyone else). Open cards
 * newest first, then the last finished ones.
 */
export async function listBoard(
  env: Env,
  actor: Actor,
  board: Board,
  view: "public" | "work",
) {
  const full = view === "work";
  if (full && !canManageBoard(actor, board)) return null;
  const db = getDb(env);
  const where = (...extra: Parameters<typeof and>) =>
    and(
      eq(tasks.board, board),
      isNull(tasks.deletedAt),
      full ? undefined : eq(tasks.public, true),
      ...extra,
    );
  const [open, done] = await Promise.all([
    db
      .select()
      .from(tasks)
      .where(where(ne(tasks.status, "done")))
      .orderBy(desc(tasks.createdAt))
      .all(),
    db
      .select()
      .from(tasks)
      .where(where(eq(tasks.status, "done")))
      .orderBy(desc(tasks.doneAt))
      .limit(DONE_LIMIT)
      .all(),
  ]);
  const all = [...open, ...done];
  const people = await assigneesOf(
    db,
    all.map((t) => t.id),
  );
  return all.map((t) => {
    const who = people.get(t.id) ?? [];
    return {
      id: t.id,
      title: t.title,
      place: t.place,
      status: t.status,
      public: t.public,
      createdAt: t.createdAt,
      doneAt: t.doneAt,
      assigneeIds: who.map((p) => p.id),
      assignees: who.map((p) => p.name),
    };
  });
}

/** One card with what this person may see and do, or null. */
export async function getTask(env: Env, actor: Actor, id: number) {
  const db = getDb(env);
  const t = await db.select().from(tasks).where(eq(tasks.id, id)).get();
  if (!t || !canSeeTask(actor, t)) return null;
  const full = canManageBoard(actor, t.board);
  const assignees = (await assigneesOf(db, [id])).get(id) ?? [];
  if (!full)
    return {
      full: false as const,
      task: {
        id: t.id,
        board: t.board,
        title: t.title,
        place: t.place,
        status: t.status,
        public: t.public,
        createdAt: t.createdAt,
        doneAt: t.doneAt,
        assignees: assignees.map((p) => p.name),
      },
    };

  const [author, history] = await Promise.all([
    db
      .select({ name: residents.name })
      .from(residents)
      .where(eq(residents.id, t.createdBy))
      .get(),
    db
      .select({
        id: activityLog.id,
        action: activityLog.action,
        details: activityLog.details,
        createdAt: activityLog.createdAt,
        actor: residents.name,
      })
      .from(activityLog)
      .innerJoin(residents, eq(residents.id, activityLog.actorId))
      .where(and(eq(activityLog.entity, "task"), eq(activityLog.entityId, id)))
      .orderBy(desc(activityLog.createdAt))
      .all(),
  ]);
  return {
    full: true as const,
    task: {
      id: t.id,
      board: t.board,
      title: t.title,
      details: t.details,
      place: t.place,
      status: t.status,
      public: t.public,
      createdAt: t.createdAt,
      doneAt: t.doneAt,
      author: author?.name ?? "",
      assignees: assignees.map((p) => p.name),
      patrolId: t.patrolId,
    },
    mine: assignees.some((p) => p.id === actor.id),
    // A card from a complaint is turned down, never deleted.
    canDelete: canDeleteTask(actor, t) && !(await isComplaintCard(env, id)),
    history: history.map((h) => ({
      id: h.id,
      actor: h.actor,
      label: historyLabel(h.action, h.details),
      createdAt: h.createdAt,
    })),
  };
}

export type SaveResult =
  { ok: true; id: number } | { ok: false; errors: TaskErrors };

export async function createTask(
  env: Env,
  actor: Actor,
  board: Board,
  form: FormData,
): Promise<SaveResult | null> {
  if (!canManageBoard(actor, board)) return null;
  const parsed = parseTaskForm(form);
  if (!parsed.ok) return parsed;
  const db = getDb(env);
  const now = Date.now();
  const t = await db
    .insert(tasks)
    .values({
      ...parsed.values,
      board,
      createdBy: actor.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  await activity(db, {
    actorId: actor.id,
    action: "task.created",
    entity: "task",
    entityId: t.id,
    details: { title: t.title, board, public: t.public },
  });
  return { ok: true, id: t.id };
}

/** The card if it exists, is not removed and this person keeps its board. */
async function managedTask(
  db: Db,
  actor: Actor,
  id: number,
): Promise<Task | null> {
  const t = await db.select().from(tasks).where(eq(tasks.id, id)).get();
  if (!t || t.deletedAt !== null || !canManageBoard(actor, t.board))
    return null;
  return t;
}

export async function updateTask(
  env: Env,
  actor: Actor,
  id: number,
  form: FormData,
): Promise<SaveResult | null> {
  const db = getDb(env);
  const t = await managedTask(db, actor, id);
  if (!t) return null;
  const parsed = parseTaskForm(form);
  if (!parsed.ok) return parsed;
  await db
    .update(tasks)
    .set({ ...parsed.values, updatedAt: Date.now() })
    .where(eq(tasks.id, id));
  await activity(db, {
    actorId: actor.id,
    action: "task.updated",
    entity: "task",
    entityId: id,
    details: {
      title: parsed.values.title,
      ...(parsed.values.public !== t.public
        ? { public: parsed.values.public }
        : {}),
    },
  });
  return { ok: true, id };
}

export async function setTaskStatus(
  env: Env,
  actor: Actor,
  id: number,
  status: TaskStatus,
): Promise<boolean> {
  const db = getDb(env);
  const t = await managedTask(db, actor, id);
  if (!t) return false;
  if (t.status === status) return true;
  const now = Date.now();
  await db
    .update(tasks)
    .set({ status, updatedAt: now, doneAt: status === "done" ? now : null })
    .where(eq(tasks.id, id));
  await activity(db, {
    actorId: actor.id,
    action: "task.status",
    entity: "task",
    entityId: id,
    details: { from: t.status, status },
  });
  return true;
}

const hasPeople = (id: number) =>
  sql`exists (select 1 from ${taskAssignees} where ${taskAssignees.taskId} = ${id})`;

/** Joins the people working on the card; a new card moves to «В роботі». */
export async function takeTask(
  env: Env,
  actor: Actor,
  id: number,
): Promise<boolean> {
  const db = getDb(env);
  const t = await managedTask(db, actor, id);
  if (!t || t.status === "done") return false;
  const added = await db
    .insert(taskAssignees)
    .values({ taskId: id, residentId: actor.id, createdAt: Date.now() })
    .onConflictDoNothing()
    .returning({ taskId: taskAssignees.taskId })
    .all();
  if (added.length === 0) return true;
  await db
    .update(tasks)
    .set({ status: "in_progress", updatedAt: Date.now() })
    .where(and(eq(tasks.id, id), eq(tasks.status, "new")));
  await activity(db, {
    actorId: actor.id,
    action: "task.taken",
    entity: "task",
    entityId: id,
  });
  return true;
}

/** Steps away from the card; one left with nobody goes back to «Нові». */
export async function leaveTask(
  env: Env,
  actor: Actor,
  id: number,
): Promise<boolean> {
  const db = getDb(env);
  const t = await managedTask(db, actor, id);
  if (!t) return false;
  const removed = await db
    .delete(taskAssignees)
    .where(
      and(eq(taskAssignees.taskId, id), eq(taskAssignees.residentId, actor.id)),
    )
    .returning({ taskId: taskAssignees.taskId })
    .all();
  if (removed.length === 0) return true;
  await db
    .update(tasks)
    .set({ status: "new", updatedAt: Date.now() })
    .where(
      and(
        eq(tasks.id, id),
        eq(tasks.status, "in_progress"),
        sql`not ${hasPeople(id)}`,
      ),
    );
  await activity(db, {
    actorId: actor.id,
    action: "task.left",
    entity: "task",
    entityId: id,
  });
  return true;
}

/**
 * Hands the card to the other board, with its history. Those who worked on
 * it are cleared, so an unfinished card starts again in «Нові». A move never
 * makes a card more public: it stays public only if it was and the new
 * board's cards start public.
 */
export async function moveTask(
  env: Env,
  actor: Actor,
  id: number,
): Promise<Board | null> {
  const db = getDb(env);
  const t = await managedTask(db, actor, id);
  if (!t) return null;
  const to = otherBoard(t.board);
  await db.delete(taskAssignees).where(eq(taskAssignees.taskId, id));
  await db
    .update(tasks)
    .set({
      board: to,
      public: t.public && defaultPublic(to),
      status: t.status === "done" ? "done" : "new",
      updatedAt: Date.now(),
    })
    .where(eq(tasks.id, id));
  await activity(db, {
    actorId: actor.id,
    action: "task.moved",
    entity: "task",
    entityId: id,
    details: { from: t.board, to },
  });
  return to;
}

export async function deleteTask(
  env: Env,
  actor: Actor,
  id: number,
): Promise<Board | null> {
  const db = getDb(env);
  const t = await db.select().from(tasks).where(eq(tasks.id, id)).get();
  if (!t || !canDeleteTask(actor, t) || (await isComplaintCard(env, id)))
    return null;
  await db
    .update(tasks)
    .set({ deletedAt: Date.now() })
    .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)));
  await activity(db, {
    actorId: actor.id,
    action: "task.deleted",
    entity: "task",
    entityId: id,
    details: { title: t.title },
  });
  return t.board;
}

/** A card's column now, to tell a complaint's author when it changes. */
export async function taskStatusOf(env: Env, id: number) {
  const t = await getDb(env)
    .select({ status: tasks.status })
    .from(tasks)
    .where(eq(tasks.id, id))
    .get();
  return t?.status ?? null;
}
