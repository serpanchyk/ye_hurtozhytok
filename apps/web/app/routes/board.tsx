import { useEffect, useRef, useState } from "react";
import { Link, useFetchers, useSubmit } from "react-router";

import { PillGroup } from "~/components/pill-group";
import { Credit, Icon, SectionBar } from "~/components/ui";
import { agoLabel } from "~/lib/announcements";
import { requireProfile } from "~/lib/auth.server";
import { isCouncil, isSquad } from "~/lib/permissions";
import {
  BOARDS,
  BOARD_DATIVE,
  BOARD_LABELS,
  STATUS_LABELS,
  TASK_STATUSES,
  columns,
  isBoard,
  isTaskStatus,
  readFilter,
  type Board,
  type TaskFilter,
  type TaskStatus,
} from "~/lib/tasks";
import { listBoard } from "~/lib/tasks.server";
import { kyivDateKey, kyivNow } from "~/lib/time";
import { useCardDrag } from "~/lib/use-card-drag";
import { usePolling } from "~/lib/use-polling";
import type { Route } from "./+types/board";

export const handle = { tab: "board", wide: true };
export const meta: Route.MetaFunction = () => [
  { title: "Дошка · єГуртожиток" },
];

const FILTERS: { id: TaskFilter; label: string }[] = [
  { id: "all", label: "Усі" },
  { id: "mine", label: "Мої" },
  { id: "free", label: "Нічиї" },
];

function query(board: Board, filter: TaskFilter) {
  return filter === "all" ? `?b=${board}` : `?b=${board}&f=${filter}`;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  const url = new URL(request.url);
  const b = url.searchParams.get("b");
  // The squad opens its own board; everyone else starts with the council's.
  const board: Board = isBoard(b)
    ? b
    : isSquad(me) && !isCouncil(me)
      ? "squad"
      : "council";
  const { full, cards } = await listBoard(env, me, board);
  const today = kyivNow().date;
  const moved = url.searchParams.get("moved");
  return {
    name: me.name,
    me: me.id,
    board,
    filter: full ? readFilter(url.searchParams.get("f")) : "all",
    full,
    moved: isBoard(moved) ? moved : null,
    cards: cards.map((c) => ({
      ...c,
      done: c.doneAt ? agoLabel(kyivDateKey(c.doneAt), today) : null,
    })),
  };
}

/** Cards being moved right now, by id: the board shows them in place at once. */
function useMoving() {
  const moving = new Map<number, TaskStatus>();
  let error: string | null = null;
  for (const f of useFetchers()) {
    if (!f.key.startsWith("task-move-")) continue;
    const id = Number(f.key.slice("task-move-".length));
    const status = f.formData?.get("status");
    if (f.state !== "idle" && isTaskStatus(status)) moving.set(id, status);
    if (f.state === "idle" && f.data?.error) error = f.data.error;
  }
  return { moving, error };
}

export default function BoardPage({ loaderData }: Route.ComponentProps) {
  usePolling(30_000);
  const { name, me, board, filter, full, moved } = loaderData;
  const { moving, error } = useMoving();
  const submit = useSubmit();
  const cols = columns(
    loaderData.cards.map((c) => ({
      ...c,
      status: moving.get(c.id) ?? c.status,
    })),
    filter,
    me,
  );

  // The card that has just been dropped pops into its new column.
  const [landed, setLanded] = useState<number | null>(null);
  useEffect(() => {
    if (landed === null) return;
    const t = setTimeout(() => setLanded(null), 600);
    return () => clearTimeout(t);
  }, [landed]);

  const colsRef = useRef<HTMLDivElement>(null);
  useCardDrag(colsRef, {
    enabled: full,
    onDrop: (id, to) => {
      if (!isTaskStatus(to)) return;
      setLanded(id);
      submit(
        { intent: "status", status: to },
        {
          method: "post",
          action: `/tasks/${id}`,
          navigate: false,
          fetcherKey: `task-move-${id}`,
        },
      );
    },
  });

  return (
    <>
      <SectionBar name={name} />
      <h2 className="title" style={{ marginBottom: 6 }}>
        Дошка
      </h2>
      <p className="lede" style={{ marginBottom: 14 }}>
        {full
          ? "Картки вашої дошки. Приватні бачать лише ті, хто її веде. Утримайте картку, щоб перетягнути її в іншу колонку."
          : "Над чим працюють студрада й оперзагін і хто цим займається."}
      </p>

      {moved && (
        <p className="ok-note" role="status">
          Картку передано {BOARD_DATIVE[moved]}.
        </p>
      )}
      {error && (
        <p className="error-note" role="alert">
          {error}
        </p>
      )}

      <div className="board-bar">
        <PillGroup className="seg" label="Дошка">
          {BOARDS.map((b) => (
            <Link
              data-pill-item
              key={b}
              to={`?b=${b}`}
              replace
              preventScrollReset
              aria-current={b === board ? "true" : undefined}
            >
              {BOARD_LABELS[b]}
            </Link>
          ))}
        </PillGroup>
        {full && (
          <PillGroup className="seg" label="Які картки">
            {FILTERS.map((f) => (
              <Link
                data-pill-item
                key={f.id}
                to={query(board, f.id)}
                replace
                preventScrollReset
                aria-current={f.id === filter ? "true" : undefined}
              >
                {f.label}
              </Link>
            ))}
          </PillGroup>
        )}
      </div>

      <div className="board-cols" ref={colsRef}>
        {TASK_STATUSES.map((status) => (
          <section
            key={status}
            className="board-col"
            data-drop={status}
            aria-label={STATUS_LABELS[status]}
          >
            <div className="section-h">
              <h3>{STATUS_LABELS[status]}</h3>
              <span className="muted">{cols[status].length}</span>
            </div>
            {cols[status].length ? (
              <div className="task-list">
                {cols[status].map((t) => (
                  <Link
                    viewTransition
                    className={`glass ann-row task-card${t.id === landed ? " is-landed" : ""}`}
                    to={`/tasks/${t.id}`}
                    key={t.id}
                    data-task={t.id}
                    data-status={t.status}
                    data-draggable={full ? "" : undefined}
                    draggable={false}
                  >
                    <span className="ann-row-text">
                      {!t.public && (
                        <span className="ann-flag">
                          <Icon name="lock" small />
                          Приватна
                        </span>
                      )}
                      <b>{t.title}</b>
                      <span className="meta">
                        {t.place && (
                          <span>
                            <Icon name="pin" small />
                            {t.place}
                          </span>
                        )}
                        {t.assignees.length > 0 && (
                          <span>
                            <Icon name="user" small />
                            {t.assignees.join(", ")}
                          </span>
                        )}
                        {full &&
                          t.assignees.length === 0 &&
                          status !== "done" && <span>нічия</span>}
                        {t.done && status === "done" && (
                          <span>готово {t.done}</span>
                        )}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="glass empty">Порожньо</div>
            )}
          </section>
        ))}
      </div>

      {full && (
        <div className="home-actions">
          <Link
            viewTransition
            className="btn btn-soft block"
            to={`/tasks/new?b=${board}`}
          >
            <Icon name="plus" />
            Нова картка
          </Link>
        </div>
      )}
      <Credit />
    </>
  );
}
