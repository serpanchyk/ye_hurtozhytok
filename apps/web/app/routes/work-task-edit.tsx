import { data, redirect } from "react-router";

import { TaskForm } from "~/components/task-form";
import { Credit, TopBar } from "~/components/ui";
import { requireProfile } from "~/lib/auth.server";
import { isComplaintCard } from "~/lib/complaints.server";
import { getTask, updateTask } from "~/lib/tasks.server";
import type { Route } from "./+types/work-task-edit";

export const meta: Route.MetaFunction = () => [
  { title: "Змінити картку · єГуртожиток" },
];

const NOT_YOURS = "Змінювати картку можуть ті, хто веде цю дошку.";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  const found = await getTask(env, me, Number(params.id));
  if (!found) throw new Response("Такої картки немає.", { status: 404 });
  if (!found.full) throw new Response(NOT_YOURS, { status: 403 });
  const t = found.task;
  return {
    id: t.id,
    complaint: await isComplaintCard(env, t.id),
    initial: {
      title: t.title,
      details: t.details,
      place: t.place,
      public: t.public,
      board: t.board,
    },
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  const id = Number(params.id);
  const result = await updateTask(env, me, id, await request.formData());
  if (!result) throw new Response(NOT_YOURS, { status: 403 });
  if (!result.ok) return data({ errors: result.errors }, { status: 400 });
  throw redirect(`/work/tasks/${id}`);
}

export default function EditTask({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <>
      <TopBar back={`/work/tasks/${loaderData.id}`} title="Змінити картку" />
      <TaskForm
        initial={loaderData.initial}
        errors={actionData?.errors}
        submitLabel="Зберегти"
        complaint={loaderData.complaint}
      />
      <Credit />
    </>
  );
}
