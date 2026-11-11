import { useEffect, useRef, useState } from "react";
import { Link, redirect, useFetchers, useSubmit } from "react-router";

import { BoardColumns, BoardTabs } from "~/components/board";
import { PillGroup } from "~/components/pill-group";
import { Credit, Icon, TopBar } from "~/components/ui";
import { agoLabel } from "~/lib/announcements";
import { requireProfile } from "~/lib/auth.server";
import { canManageBoard } from "~/lib/permissions";
import {
  BOARDS,
  BOARD_DATIVE,
  BOARD_LABELS,
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
import type { Route } from "./+types/work-board";

export const handle = { wide: true };
export const meta: Route.MetaFunction = () => [
  { title: "Робоча дошка · єГуртожиток" },
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
  const boards = BOARDS.filter((b) => canManageBoard(me, b));
  if (boards.length === 0) throw redirect("/board");
  const url = new URL(request.url);
  const b = url.searchParams.get("b");
  const board: Board = isBoard(b) && boards.includes(b) ? b : boards[0];
  const cards = (await listBoard(env, me, board, "work")) ?? [];
  const today = kyivNow().date;
  const moved = url.searchParams.get("moved");
  return {
    me: me.id,
    boards,
    board,
    filter: readFilter(url.searchParams.get("f")),
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

/** The working board in «Праця»: every card, private ones too, to change and drag. */
export default function WorkBoard({ loaderData }: Route.ComponentProps) {
  usePolling(30_000);
  const { me, boards, board, filter, moved } = loaderData;
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
    enabled: true,
    onDrop: (id, to) => {
      if (!isTaskStatus(to)) return;
      setLanded(id);
      submit(
        { intent: "status", status: to },
        {
          method: "post",
          action: `/work/tasks/${id}`,
          navigate: false,
          fetcherKey: `task-move-${id}`,
        },
      );
    },
  });

  return (
    <>
      <TopBar back="/work" title={BOARD_LABELS[board]} />
      <h2 className="title" style={{ marginBottom: 6 }}>
        Робоча дошка
      </h2>
      <p className="lede" style={{ marginBottom: 14 }}>
        Усі картки, приватні теж. Утримайте картку, щоб перетягнути її в іншу
        колонку.
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
        {boards.length > 1 && (
          <BoardTabs
            board={board}
            boards={boards}
            query={(b) => query(b, filter)}
          />
        )}
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
      </div>

      <BoardColumns
        columns={cols}
        href={(id) => `/work/tasks/${id}`}
        keeper
        landed={landed}
        innerRef={colsRef}
      />

      <div className="home-actions">
        <Link
          viewTransition
          className="btn btn-soft block"
          to={`/work/tasks/new?b=${board}`}
        >
          <Icon name="plus" />
          Нова картка
        </Link>
      </div>
      <Credit />
    </>
  );
}
