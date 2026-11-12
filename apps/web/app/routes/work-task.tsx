import { Form, Link, data, redirect, useNavigation } from "react-router";

import { ConfirmButton } from "~/components/controls";
import { TaskArticle } from "~/components/board";
import { ComplaintActions, ComplaintDetails } from "~/components/complaint";
import { PillGroup } from "~/components/pill-group";
import { Credit, Icon, TopBar } from "~/components/ui";
import { agoLabel } from "~/lib/announcements";
import { requireProfile } from "~/lib/auth.server";
import {
  BOARD_DATIVE,
  BOARD_LABELS,
  STATUS_LABELS,
  TASK_STATUSES,
  isTaskStatus,
  otherBoard,
} from "~/lib/tasks";
import {
  complaintCardMoved,
  complaintForTask,
  decideComplaint,
} from "~/lib/complaints.server";
import { patrolDateOf } from "~/lib/patrols.server";
import {
  deleteTask,
  getTask,
  leaveTask,
  moveTask,
  setTaskStatus,
  takeTask,
  taskStatusOf,
} from "~/lib/tasks.server";
import { dateLong, kyivDateKey, kyivNow } from "~/lib/time";
import type { Route } from "./+types/work-task";

export const meta: Route.MetaFunction = ({ data }) => [
  { title: `${data?.task.title ?? "Картка"} · єГуртожиток` },
];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  const found = await getTask(env, me, Number(params.id));
  // Everyone else looks at a public card on the public board.
  if (found && !found.full && found.task.public)
    throw redirect(`/board/${found.task.id}`);
  if (!found || !found.full)
    throw new Response("Такої картки немає або вона не для вас.", {
      status: 404,
    });
  const t = found.task;
  const today = kyivNow().date;
  const ago = (ms: number) => agoLabel(kyivDateKey(ms), today);
  return {
    task: {
      id: t.id,
      board: t.board,
      title: t.title,
      place: t.place,
      status: t.status,
      public: t.public,
      assignees: t.assignees,
      details: t.details,
      author: t.author,
      created: ago(t.createdAt),
      done: t.doneAt ? ago(t.doneAt) : null,
    },
    mine: found.mine,
    canDelete: found.canDelete,
    complaint: await complaintForTask(env, me, t.id),
    patrol: await patrolDateOf(env, t.patrolId),
    history: found.history.map((h) => ({
      id: h.id,
      actor: h.actor,
      label: h.label,
      when: ago(h.createdAt),
    })),
  };
}

const NOT_YOURS = "Це може робити лише той, хто веде цю дошку.";

export async function action({ request, params, context }: Route.ActionArgs) {
  const { env, ctx } = context.cloudflare;
  const me = await requireProfile(request, env);
  const id = Number(params.id);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "answer" || intent === "reject") {
    const c = await complaintForTask(env, me, id);
    if (!c) return data({ error: NOT_YOURS }, { status: 403 });
    const result = await decideComplaint(env, ctx, me, c.id, intent, form);
    if (!result.ok) return data({ error: result.error }, { status: 400 });
    // A turned-down complaint's card has left the board.
    if (intent === "reject") throw redirect(`/work/board?b=${c.board}`);
    return null;
  }
  if (intent === "delete") {
    const board = await deleteTask(env, me, id);
    if (!board) return data({ error: "Видалити не вдалося." }, { status: 403 });
    throw redirect(`/work/board?b=${board}`);
  }
  if (intent === "move") {
    const to = await moveTask(env, me, id);
    if (!to) return data({ error: NOT_YOURS }, { status: 403 });
    throw redirect(`/work/board?b=${otherBoard(to)}&moved=${to}`);
  }
  const before = await taskStatusOf(env, id);
  let ok = false;
  if (intent === "take") ok = await takeTask(env, me, id);
  else if (intent === "leave") ok = await leaveTask(env, me, id);
  else if (intent === "status") {
    const status = form.get("status");
    if (!isTaskStatus(status))
      return data({ error: "Невідомий стан." }, { status: 400 });
    ok = await setTaskStatus(env, me, id, status);
  }
  if (!ok) return data({ error: NOT_YOURS }, { status: 403 });
  const after = await taskStatusOf(env, id);
  if (before && after)
    await complaintCardMoved(env, ctx, me.id, id, before, after);
  return null;
}

/** A card in the work pages: change its state, take it, hand it over, edit, delete. */
export default function WorkTaskPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { task: t, mine, canDelete, history, complaint, patrol } = loaderData;
  const busy = useNavigation().state === "submitting";
  const other = BOARD_DATIVE[otherBoard(t.board)];
  return (
    <>
      <TopBar back={`/work/board?b=${t.board}`} title={BOARD_LABELS[t.board]} />

      {actionData && "error" in actionData && (
        <p className="error-note" role="alert">
          {actionData.error}
        </p>
      )}

      <TaskArticle
        task={t}
        details={t.details}
        byline={`Додано ${t.created} · автор: ${t.author}${patrol ? ` · з обходу ${dateLong(patrol)}` : ""}${t.done ? ` · готово ${t.done}` : ""}`}
      >
        <Form method="post" className="task-status-form">
          <input type="hidden" name="intent" value="status" />
          <PillGroup as="div" className="seg" label="Стан">
            {TASK_STATUSES.map((s) => (
              <button
                data-pill-item
                key={s}
                type="submit"
                name="status"
                value={s}
                aria-current={t.status === s ? "true" : undefined}
                disabled={busy}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </PillGroup>
        </Form>
      </TaskArticle>

      {complaint && (
        <>
          <div className="section-h">
            <h3>Звернення</h3>
          </div>
          <ComplaintDetails c={complaint} byline="Від мешканця" withAuthor />
          <ComplaintActions
            id={complaint.id}
            status={complaint.status}
            reply={complaint.reply}
            canResolve={false}
          />
        </>
      )}

      <div className="home-actions">
        {!mine && t.status !== "done" && (
          <Form method="post" className="confirm-form">
            <button
              className="btn btn-primary block"
              type="submit"
              name="intent"
              value="take"
              disabled={busy}
            >
              {t.assignees.length ? "Долучитися" : "Взяти собі"}
            </button>
          </Form>
        )}
        {mine && (
          <Form method="post" className="confirm-form">
            <button
              className="btn btn-soft block"
              type="submit"
              name="intent"
              value="leave"
              disabled={busy}
            >
              Я більше не виконую
            </button>
          </Form>
        )}
        <Form method="post" className="confirm-form">
          <ConfirmButton
            className="btn btn-soft block"
            name="intent"
            value="move"
            question={`Передати ${other}? Виконавці зміняться.`}
            yes="Так, передати"
          >
            Передати {other}
          </ConfirmButton>
        </Form>
      </div>

      <div className="ann-actions">
        <Link
          viewTransition
          className="btn btn-soft"
          to={`/work/tasks/${t.id}/edit`}
        >
          <Icon name="pencil" small />
          Змінити
        </Link>
        {canDelete && (
          <Form method="post" replace className="confirm-form">
            <ConfirmButton
              className="btn btn-ghost-danger block"
              name="intent"
              value="delete"
              question={
                complaint
                  ? "Видалити картку разом зі зверненням? Його не побачить і автор."
                  : "Видалити картку? Її більше ніхто не побачить."
              }
              yes="Так, видалити"
            >
              Видалити
            </ConfirmButton>
          </Form>
        )}
      </div>

      {history.length > 0 && (
        <section>
          <div className="section-h">
            <h3>Історія</h3>
          </div>
          <div className="glass" style={{ padding: "4px 0" }}>
            {history.map((h) => (
              <div className="list-row" key={h.id}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>
                    {h.actor} {h.label}
                  </b>
                  <span className="sub">{h.when}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      <Credit />
    </>
  );
}
