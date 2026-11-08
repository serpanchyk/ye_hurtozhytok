import { Link } from "react-router";

import { PillGroup } from "~/components/pill-group";
import { Credit, Icon, TopBar } from "~/components/ui";
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
  readFilter,
  type Board,
  type TaskFilter,
} from "~/lib/tasks";
import { listBoard } from "~/lib/tasks.server";
import { kyivDateKey, kyivNow } from "~/lib/time";
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
  const filter = full ? readFilter(url.searchParams.get("f")) : "all";
  const today = kyivNow().date;
  const moved = url.searchParams.get("moved");
  return {
    board,
    filter,
    full,
    moved: isBoard(moved) ? moved : null,
    columns: columns(
      cards.map((c) => ({
        ...c,
        done: c.doneAt ? agoLabel(kyivDateKey(c.doneAt), today) : null,
      })),
      filter,
      me.id,
    ),
  };
}

export default function BoardPage({ loaderData }: Route.ComponentProps) {
  usePolling(30_000);
  const { board, filter, full, moved, columns: cols } = loaderData;
  return (
    <>
      <TopBar />
      <h2 className="title" style={{ marginBottom: 6 }}>
        Дошка
      </h2>
      <p className="lede" style={{ marginBottom: 14 }}>
        {full
          ? "Картки вашої дошки. Приватні бачать лише ті, хто її веде."
          : "Над чим працюють студрада й оперзагін."}
      </p>

      {moved && (
        <p className="ok-note" role="status">
          Картку передано {BOARD_DATIVE[moved]}.
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

      <div className="board-cols">
        {TASK_STATUSES.map((status) => (
          <section
            key={status}
            className="board-col"
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
                    className="glass task-card"
                    to={`/tasks/${t.id}`}
                    key={t.id}
                  >
                    {!t.public && (
                      <span className="task-private">
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
                      {full && t.assignees.length > 0 && (
                        <span>
                          <Icon name="user" small />
                          {t.assignees.join(", ")}
                        </span>
                      )}
                      {full &&
                        t.assignees.length === 0 &&
                        status !== "done" && <span>нічия</span>}
                      {t.done && <span>готово {t.done}</span>}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="task-empty">Порожньо</p>
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
