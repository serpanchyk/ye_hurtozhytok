import { and, desc, eq, isNull } from "drizzle-orm";

import {
  COMPLAINT_STATUS_LABELS,
  MAX_OPEN,
  TOPIC_BOARD,
  TOPIC_LABELS,
  cardTitle,
  complaintStatus,
  parseComplaintForm,
  readReply,
  type ComplaintErrors,
  type ComplaintStatus,
} from "./complaints";
import { assigneesOf } from "./assignees.server";
import { activity, getDb } from "./db";
import {
  complaints,
  residents,
  tasks,
  type Board,
  type Complaint,
  type TaskStatus,
} from "./db/schema";
import {
  canHandleComplaint,
  canSeeComplaint,
  canWriteComplaint,
  type Actor,
} from "./permissions";
import { notify } from "./push.server";
import { idsWithRoles } from "./roles.server";

type Ctx = { waitUntil(promise: Promise<unknown>): void };

const KEEPERS: Record<Board, Parameters<typeof idsWithRoles>[1]> = {
  council: ["council", "council_head", "site_manager"],
  squad: ["squad", "squad_head", "site_manager"],
};

/** A complaint with its card's board and column, if it has a card. */
async function withCard(env: Env, where: ReturnType<typeof eq>) {
  return getDb(env)
    .select({
      c: complaints,
      board: tasks.board,
      taskStatus: tasks.status,
    })
    .from(complaints)
    .leftJoin(tasks, eq(tasks.id, complaints.taskId))
    .where(where)
    .all();
}

function statusOf(row: {
  c: Complaint;
  taskStatus: TaskStatus | null;
}): ComplaintStatus {
  return complaintStatus({
    rejectedAt: row.c.rejectedAt,
    resolvedAt: row.c.resolvedAt,
    taskStatus: row.taskStatus,
  });
}

export type CreateResult =
  { ok: true; id: number } | { ok: false; errors: ComplaintErrors };

/**
 * A new complaint. The limit of open ones is checked in the same statement
 * as the insert. One about the dormitory becomes a private card in «Нові» on
 * its board, named by topic and place; those who keep that board (or, for
 * the app, the site manager) get a notification.
 */
export async function createComplaint(
  env: Env,
  ctx: Ctx,
  actor: Actor,
  form: FormData,
): Promise<CreateResult> {
  if (!canWriteComplaint(actor))
    return { ok: false, errors: { body: "Ваш акаунт заблоковано." } };
  const parsed = parseComplaintForm(form);
  if (!parsed.ok) return parsed;
  const { topic, body, place } = parsed.values;
  const now = Date.now();
  const inserted = await env.DB.prepare(
    `INSERT INTO complaints (author_id, topic, body, place, created_at, updated_at)
     SELECT ?1, ?2, ?3, ?4, ?5, ?5
     WHERE (
       SELECT count(*) FROM complaints c
       LEFT JOIN tasks t ON t.id = c.task_id
       WHERE c.author_id = ?1 AND c.rejected_at IS NULL
         AND c.resolved_at IS NULL AND (t.id IS NULL OR t.status != 'done')
     ) < ?6
     RETURNING id`,
  )
    .bind(actor.id, topic, body, place, now, MAX_OPEN)
    .first<{ id: number }>();
  if (!inserted)
    return {
      ok: false,
      errors: {
        body: `У вас уже ${MAX_OPEN} незакритих звернень. Нове можна написати, коли якесь вирішать.`,
      },
    };

  const db = getDb(env);
  const board = TOPIC_BOARD[topic];
  let taskId: number | null = null;
  if (board) {
    const t = await db
      .insert(tasks)
      .values({
        board,
        title: cardTitle(topic, place),
        place,
        public: false,
        createdBy: actor.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: tasks.id })
      .get();
    taskId = t.id;
    await db
      .update(complaints)
      .set({ taskId })
      .where(eq(complaints.id, inserted.id));
    await activity(db, {
      actorId: actor.id,
      action: "task.created",
      entity: "task",
      entityId: taskId,
      details: { title: cardTitle(topic, place), board, complaint: true },
    });
  }
  await activity(db, {
    actorId: actor.id,
    action: "complaint.created",
    entity: "complaint",
    entityId: inserted.id,
    details: { topic },
  });

  ctx.waitUntil(
    idsWithRoles(env, board ? KEEPERS[board] : ["site_manager"])
      .then((ids) =>
        notify(
          env,
          ids.filter((id) => id !== actor.id),
          {
            title: "Нове звернення",
            body: cardTitle(topic, place),
            url: taskId
              ? `/work/tasks/${taskId}`
              : `/work/complaints/${inserted.id}`,
          },
        ),
      )
      .catch((e) => console.error("complaint notify failed", inserted.id, e)),
  );
  return { ok: true, id: inserted.id };
}

/** The person's own complaints, newest first, with their state. */
export async function listMyComplaints(env: Env, actorId: number) {
  const rows = await withCard(env, eq(complaints.authorId, actorId));
  return rows
    .sort((a, b) => b.c.createdAt - a.c.createdAt)
    .map((r) => ({
      id: r.c.id,
      title: cardTitle(r.c.topic, r.c.place),
      status: statusOf(r),
      createdAt: r.c.createdAt,
    }));
}

/** Complaints about the app still waiting for the site manager. */
export async function listAppComplaints(env: Env) {
  const rows = await getDb(env)
    .select({ c: complaints, author: residents.name })
    .from(complaints)
    .leftJoin(residents, eq(residents.id, complaints.authorId))
    .where(
      and(
        eq(complaints.topic, "app"),
        isNull(complaints.rejectedAt),
        isNull(complaints.resolvedAt),
      ),
    )
    .orderBy(desc(complaints.createdAt))
    .all();
  return rows.map((r) => ({
    id: r.c.id,
    body: r.c.body,
    author: r.author ?? "",
    createdAt: r.c.createdAt,
  }));
}

/** One complaint as its author or a handler sees it, or null. */
export async function getComplaint(env: Env, actor: Actor, id: number) {
  const [row] = await withCard(env, eq(complaints.id, id));
  if (!row) return null;
  const ref = { authorId: row.c.authorId, board: row.board };
  if (!canSeeComplaint(actor, ref)) return null;
  const db = getDb(env);
  const assignees = row.c.taskId
    ? ((await assigneesOf(db, [row.c.taskId])).get(row.c.taskId) ?? [])
    : [];
  const author = row.c.authorId
    ? await db
        .select({
          name: residents.name,
          room: residents.room,
          telegram: residents.telegram,
        })
        .from(residents)
        .where(eq(residents.id, row.c.authorId))
        .get()
    : undefined;
  return {
    id: row.c.id,
    topic: row.c.topic,
    topicLabel: TOPIC_LABELS[row.c.topic],
    title: cardTitle(row.c.topic, row.c.place),
    body: row.c.body,
    place: row.c.place,
    reply: row.c.reply,
    taskId: row.c.taskId,
    board: row.board,
    status: statusOf(row),
    // Who works on it, so the author knows who is on their complaint.
    assignees: assignees.map((p) => p.name),
    createdAt: row.c.createdAt,
    mine: row.c.authorId === actor.id,
    canHandle: canHandleComplaint(actor, ref),
    author: author ?? null,
  };
}
export type ComplaintView = NonNullable<
  Awaited<ReturnType<typeof getComplaint>>
>;

/** The complaint behind a card, for those who keep its board. */
export async function complaintForTask(env: Env, actor: Actor, taskId: number) {
  const row = await getDb(env)
    .select({ id: complaints.id })
    .from(complaints)
    .where(eq(complaints.taskId, taskId))
    .get();
  return row ? getComplaint(env, actor, row.id) : null;
}

/** Whether a card came from a complaint; such cards are turned down, not deleted. */
export async function isComplaintCard(env: Env, taskId: number) {
  const row = await getDb(env)
    .select({ id: complaints.id })
    .from(complaints)
    .where(eq(complaints.taskId, taskId))
    .get();
  return !!row;
}

function tellAuthor(
  env: Env,
  ctx: Ctx,
  c: { id: number; authorId: number | null },
  actorId: number,
  title: string,
  body: string,
) {
  if (!c.authorId || c.authorId === actorId) return;
  ctx.waitUntil(
    notify(env, [c.authorId], {
      title,
      body,
      url: `/complaints/${c.id}`,
    }).catch((e) => console.error("complaint author notify failed", c.id, e)),
  );
}

type Decision = { ok: true } | { ok: false; error: string };

/**
 * What those who handle it tell the author: «answer» only writes the reply,
 * «reject» turns it down (a reply is required and its card leaves the board),
 * «resolve» closes one about the app, which has no card.
 */
export async function decideComplaint(
  env: Env,
  ctx: Ctx,
  actor: Actor,
  id: number,
  intent: "answer" | "reject" | "resolve",
  form: FormData,
): Promise<Decision> {
  const [row] = await withCard(env, eq(complaints.id, id));
  if (!row || !canHandleComplaint(actor, { board: row.board }))
    return { ok: false, error: "Це звернення розглядають інші." };
  const reply = readReply(form);
  const status = statusOf(row);
  if (intent !== "answer" && status !== "sent" && status !== "in_progress")
    return { ok: false, error: "Це звернення вже закрите." };
  if (intent === "reject" && reply.length < 3)
    return { ok: false, error: "Напишіть автору, чому звернення відхилено." };
  if (intent === "resolve" && row.c.taskId)
    return { ok: false, error: "Його закривають на дошці." };
  if (intent === "answer" && reply.length < 1)
    return { ok: false, error: "Напишіть відповідь." };

  const db = getDb(env);
  const now = Date.now();
  await db
    .update(complaints)
    .set({
      reply,
      updatedAt: now,
      ...(intent === "reject" ? { rejectedAt: now } : {}),
      ...(intent === "resolve" ? { resolvedAt: now } : {}),
    })
    .where(eq(complaints.id, id));
  // A turned-down complaint's card leaves the board; its history stays.
  if (intent === "reject" && row.c.taskId)
    await db
      .update(tasks)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(tasks.id, row.c.taskId));
  await activity(db, {
    actorId: actor.id,
    action:
      intent === "reject"
        ? "complaint.rejected"
        : intent === "resolve"
          ? "complaint.resolved"
          : "complaint.answered",
    entity: "complaint",
    entityId: id,
    details: { reply },
  });
  const title = cardTitle(row.c.topic, row.c.place);
  tellAuthor(
    env,
    ctx,
    row.c,
    actor.id,
    intent === "reject"
      ? "Звернення відхилено"
      : intent === "resolve"
        ? "Звернення вирішено"
        : "Відповідь на звернення",
    `${title}: ${reply}`,
  );
  return { ok: true };
}

/**
 * A card from a complaint changed its column: the author learns the new
 * state when it starts being worked on or is done.
 */
export async function complaintCardMoved(
  env: Env,
  ctx: Ctx,
  actorId: number,
  taskId: number,
  from: TaskStatus,
  to: TaskStatus,
) {
  if (from === to || to === "new") return;
  const c = await getDb(env)
    .select()
    .from(complaints)
    .where(eq(complaints.taskId, taskId))
    .get();
  if (!c || c.rejectedAt) return;
  const now = complaintStatus({
    rejectedAt: null,
    resolvedAt: null,
    taskStatus: to,
  });
  tellAuthor(
    env,
    ctx,
    c,
    actorId,
    `Звернення: ${COMPLAINT_STATUS_LABELS[now].toLowerCase()}`,
    cardTitle(c.topic, c.place) + (c.reply ? `: ${c.reply}` : ""),
  );
}
