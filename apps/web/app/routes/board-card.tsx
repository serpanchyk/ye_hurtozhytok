import { Link, redirect } from "react-router";

import { TaskArticle } from "~/components/board";
import { Credit, Icon, TopBar } from "~/components/ui";
import { agoLabel } from "~/lib/announcements";
import { requireProfile } from "~/lib/auth.server";
import { BOARD_LABELS } from "~/lib/tasks";
import { getTask } from "~/lib/tasks.server";
import { kyivDateKey, kyivNow } from "~/lib/time";
import type { Route } from "./+types/board-card";

export const handle = { tab: "services" };
export const meta: Route.MetaFunction = ({ data }) => [
  { title: `${data?.task.title ?? "Картка"} · єГуртожиток` },
];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  const found = await getTask(env, me, Number(params.id));
  // A private card is not on the public board; its keepers open it in the work pages.
  if (found && !found.task.public && found.full)
    throw redirect(`/work/tasks/${found.task.id}`);
  if (!found || !found.task.public)
    throw new Response("Такої картки немає.", { status: 404 });
  const t = found.task;
  const today = kyivNow().date;
  const ago = (ms: number) => agoLabel(kyivDateKey(ms), today);
  return {
    keeper: found.full,
    task: {
      id: t.id,
      board: t.board,
      title: t.title,
      place: t.place,
      status: t.status,
      public: t.public,
      assignees: t.assignees,
      created: ago(t.createdAt),
      done: t.doneAt ? ago(t.doneAt) : null,
    },
  };
}

/** A public card, only to look at; those who keep the board change it in the work pages. */
export default function BoardCardPage({ loaderData }: Route.ComponentProps) {
  const { keeper, task: t } = loaderData;
  return (
    <>
      <TopBar back={`/board?b=${t.board}`} title={BOARD_LABELS[t.board]} />
      <TaskArticle
        task={t}
        byline={`Додано ${t.created}${t.done ? ` · готово ${t.done}` : ""}`}
      />
      {keeper && (
        <div className="home-actions">
          <Link
            viewTransition
            className="btn btn-soft block"
            to={`/work/tasks/${t.id}`}
          >
            <Icon name="pencil" small />
            Керувати карткою
          </Link>
        </div>
      )}
      <Credit />
    </>
  );
}
