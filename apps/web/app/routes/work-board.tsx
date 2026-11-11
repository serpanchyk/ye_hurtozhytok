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
  for (const f of useFetchers()) {
    if (!f.key.startsWith("task-move-")) continue;
    const status = f.formData?.get("status");
    if (isTaskStatus(status))
      moving.set(Number(f.key.slice("task-move-".length)), status);
  }
  return moving;
}

/**
 * Whether a move did not stick. Finished fetchers leave the list, so instead
 * of their answer the board checks where the card stands once fresh data is in.
 */
function useFailedMove(
  moving: Map<number, TaskStatus>,
  cards: readonly { id: number; status: TaskStatus }[],
) {
  const dropped = useRef(new Map<number, TaskStatus>());
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    for (const [id, to] of dropped.current) {
      if (moving.has(id)) continue;
      dropped.current.delete(id);
      if (cards.find((c) => c.id === id)?.status !== to) setFailed(true);
    }
  });
  return {
    failed,
    dropped: (id: number, to: TaskStatus) => {
      dropped.current.set(id, to);
      setFailed(false);
    },
  };
}

/** The working board in the work pages: every card, private ones too, to change and drag. */
export default function WorkBoard({ loaderData }: Route.ComponentProps) {
  usePolling(30_000);
  const { me, boards, board, filter, moved } = loaderData;
  const moving = useMoving();
  const { failed, dropped } = useFailedMove(moving, loaderData.cards);
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
      dropped(id, to);
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
      <TopBar back={`/work?s=${board}`} title={BOARD_LABELS[board]} />
      <h2 className="title" style={{ marginBottom: 6 }}>
        Робоча дошка
      </h2>
      <p className="lede" style={{ marginBottom: 14 }}>
        Усі картки, приватні теж. Утримайте картку, щоб перетягнути її в іншу
        колонку.
      </p>
      <Link
        viewTransition
        className="btn btn-soft block board-new"
        to={`/work/tasks/new?b=${board}`}
      >
        <Icon name="plus" />
        Нова картка
      </Link>

      {moved && (
        <p className="ok-note" role="status">
          Картку передано {BOARD_DATIVE[moved]}.
        </p>
      )}
      {failed && (
        <p className="error-note" role="alert">
          Картку не вдалося перемістити: можливо, її вже змінили. Дошку
          оновлено.
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
      <Credit />
    </>
  );
}
