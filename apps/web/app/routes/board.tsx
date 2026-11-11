import { BoardColumns, BoardTabs } from "~/components/board";
import { Credit, TopBar } from "~/components/ui";
import { agoLabel } from "~/lib/announcements";
import { requireProfile } from "~/lib/auth.server";
import { columns, isBoard, type Board } from "~/lib/tasks";
import { listBoard } from "~/lib/tasks.server";
import { kyivDateKey, kyivNow } from "~/lib/time";
import { usePolling } from "~/lib/use-polling";
import type { Route } from "./+types/board";

export const handle = { tab: "services", wide: true };
export const meta: Route.MetaFunction = () => [
  { title: "Дошка · єГуртожиток" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  const b = new URL(request.url).searchParams.get("b");
  const board: Board = isBoard(b) ? b : "council";
  const cards = (await listBoard(env, me, board, "public")) ?? [];
  const today = kyivNow().date;
  return {
    board,
    cards: cards.map((c) => ({
      ...c,
      done: c.doneAt ? agoLabel(kyivDateKey(c.doneAt), today) : null,
    })),
  };
}

/** The public board: what the council and the squad work on and who does it. Only to look at. */
export default function BoardPage({ loaderData }: Route.ComponentProps) {
  usePolling(30_000);
  const { board, cards } = loaderData;
  return (
    <>
      <TopBar back="/services" />
      <h2 className="title" style={{ marginBottom: 6 }}>
        Дошка
      </h2>
      <p className="lede" style={{ marginBottom: 14 }}>
        Над чим працюють студрада й оперзагін і хто цим займається.
      </p>
      <BoardTabs board={board} query={(b) => `?b=${b}`} />
      <BoardColumns
        columns={columns(cards, "all", 0)}
        href={(id) => `/board/${id}`}
      />
      <Credit />
    </>
  );
}
