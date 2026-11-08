import { data, redirect } from "react-router";

import { TaskForm } from "~/components/task-form";
import { Credit, TopBar } from "~/components/ui";
import { requireProfile } from "~/lib/auth.server";
import { canManageBoard } from "~/lib/permissions";
import { BOARD_LABELS, defaultPublic, isBoard, type Board } from "~/lib/tasks";
import { createTask } from "~/lib/tasks.server";
import type { Route } from "./+types/task-new";

export const handle = { tab: "board" };
export const meta: Route.MetaFunction = () => [
  { title: "Нова картка · єГуртожиток" },
];

function boardOf(request: Request): Board {
  const b = new URL(request.url).searchParams.get("b");
  if (!isBoard(b)) throw new Response("Невідома дошка.", { status: 404 });
  return b;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const me = await requireProfile(request, context.cloudflare.env);
  const board = boardOf(request);
  if (!canManageBoard(me, board))
    throw new Response("Картки додають ті, хто веде цю дошку.", {
      status: 403,
    });
  return { board };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  const result = await createTask(
    env,
    me,
    boardOf(request),
    await request.formData(),
  );
  if (!result)
    throw new Response("Картки додають ті, хто веде цю дошку.", {
      status: 403,
    });
  if (!result.ok) return data({ errors: result.errors }, { status: 400 });
  throw redirect(`/tasks/${result.id}`);
}

export default function NewTask({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { board } = loaderData;
  return (
    <>
      <TopBar back={`/board?b=${board}`} title="Нова картка" />
      <p className="lede" style={{ margin: "0 4px 14px" }}>
        На дошку «{BOARD_LABELS[board]}».
      </p>
      <TaskForm
        initial={{
          title: "",
          details: null,
          place: null,
          public: defaultPublic(board),
        }}
        errors={actionData?.errors}
        submitLabel="Додати"
      />
      <Credit />
    </>
  );
}
