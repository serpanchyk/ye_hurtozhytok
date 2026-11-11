import { Form, Link, data, redirect, useNavigation } from "react-router";

import { ConfirmButton } from "~/components/controls";
import { PillGroup } from "~/components/pill-group";
import { Credit, Icon, TopBar } from "~/components/ui";
import { agoLabel } from "~/lib/announcements";
import { requireProfile } from "~/lib/auth.server";
import {
  BOARD_DATIVE,
  BOARD_LABELS,
  STATUS_LABELS,
  STATUS_TONE,
  TASK_STATUSES,
  isTaskStatus,
  otherBoard,
} from "~/lib/tasks";
import {
  deleteTask,
  getTask,
  leaveTask,
  moveTask,
  setTaskStatus,
  takeTask,
} from "~/lib/tasks.server";
import { kyivDateKey, kyivNow } from "~/lib/time";
import type { Route } from "./+types/task";

export const handle = { tab: "board" };
export const meta: Route.MetaFunction = ({ data }) => [
  { title: `${data?.task.title ?? "Картка"} · єГуртожиток` },
];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  const found = await getTask(env, me, Number(params.id));
  if (!found)
    throw new Response("Такої картки немає або вона не для вас.", {
      status: 404,
    });
  const today = kyivNow().date;
  const ago = (ms: number) => agoLabel(kyivDateKey(ms), today);
  const base = {
    id: found.task.id,
    board: found.task.board,
    title: found.task.title,
    place: found.task.place,
    status: found.task.status,
    public: found.task.public,
    created: ago(found.task.createdAt),
    done: found.task.doneAt ? ago(found.task.doneAt) : null,
    assignees: found.task.assignees,
  };
  if (!found.full)
    return {
      full: false as const,
      task: base,
      mine: false,
      canDelete: false,
      history: [],
    };
  return {
    full: true as const,
    task: {
      ...base,
      details: found.task.details,
      author: found.task.author,
    },
    mine: found.mine,
    canDelete: found.canDelete,
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
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  const id = Number(params.id);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "delete") {
    const board = await deleteTask(env, me, id);
    if (!board) return data({ error: "Видалити не вдалося." }, { status: 403 });
    throw redirect(`/board?b=${board}`);
  }
  if (intent === "move") {
    const to = await moveTask(env, me, id);
    if (!to) return data({ error: NOT_YOURS }, { status: 403 });
    throw redirect(`/board?b=${otherBoard(to)}&moved=${to}`);
  }
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
  return null;
}

export default function TaskPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const p = loaderData;
  const t = p.task;
  const busy = useNavigation().state === "submitting";
  const other = BOARD_DATIVE[otherBoard(t.board)];
  return (
    <>
      <TopBar back={`/board?b=${t.board}`} title={BOARD_LABELS[t.board]} />

      {actionData && "error" in actionData && (
        <p className="error-note" role="alert">
          {actionData.error}
        </p>
      )}

      <article className="glass ann-detail">
        <div className="ann-detail-top">
          <span className={`st ${STATUS_TONE[t.status]}`}>
            {STATUS_LABELS[t.status]}
          </span>
          {!t.public && (
            <span className="ann-flag">
              <Icon name="lock" small />
              Приватна
            </span>
          )}
        </div>
        <h2>{t.title}</h2>
        {t.place && (
          <p className="meta">
            <span>
              <Icon name="pin" small />
              {t.place}
            </span>
          </p>
        )}
        {p.full && p.task.details && (
          <p className="task-details">{p.task.details}</p>
        )}
        <p className="ann-by">
          {p.full
            ? `Додано ${t.created} · автор: ${p.task.author}`
            : `Додано ${t.created}`}
          {t.done && ` · готово ${t.done}`}
        </p>
      </article>

      {p.full && (
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
      )}

      <div className="glass" style={{ padding: "4px 0", marginTop: 10 }}>
        <div className="list-row">
          <span className="who-av">
            <Icon name="user" small />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <b>{t.assignees.length ? t.assignees.join(", ") : "Поки ніхто"}</b>
            <span className="sub">Виконують</span>
          </span>
        </div>
      </div>

      {p.full ? (
        <>
          <div className="home-actions">
            {!p.mine && t.status !== "done" && (
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
            {p.mine && (
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
              to={`/tasks/${t.id}/edit`}
            >
              <Icon name="pencil" small />
              Змінити
            </Link>
            {p.canDelete && (
              <Form method="post" className="confirm-form">
                <ConfirmButton
                  className="btn btn-ghost-danger block"
                  name="intent"
                  value="delete"
                  question="Видалити картку? Її більше ніхто не побачить."
                  yes="Так, видалити"
                >
                  Видалити
                </ConfirmButton>
              </Form>
            )}
          </div>

          {p.history.length > 0 && (
            <section>
              <div className="section-h">
                <h3>Історія</h3>
              </div>
              <div className="glass" style={{ padding: "4px 0" }}>
                {p.history.map((h) => (
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
        </>
      ) : (
        <p className="muted" style={{ margin: "14px 4px 0", fontSize: 13.5 }}>
          Подробиці бачать ті, хто веде дошку.
        </p>
      )}
      <Credit />
    </>
  );
}
