import { data, redirect } from "react-router";

import { TaskForm } from "~/components/task-form";
import { Credit, TopBar } from "~/components/ui";
import { requireProfile } from "~/lib/auth.server";
import { boardPeople } from "~/lib/assignees.server";
import { isComplaintCard } from "~/lib/complaints.server";
import { byName } from "~/lib/names";
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
  // Those who may give the card out pick from the board's people, plus
  // whoever is on it already, even if they have left the board since.
  const people = found.canAssign ? await boardPeople(env, t.board) : null;
  const on = t.assigneeIds.map((id, i) => ({ id, name: t.assignees[i] }));
  return {
    id: t.id,
    complaint: await isComplaintCard(env, t.id),
    people:
      people &&
      [...people, ...on.filter((p) => !people.some((q) => q.id === p.id))].sort(
        byName,
      ),
    assignees: t.assigneeIds,
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
        people={loaderData.people ?? undefined}
        assignees={loaderData.assignees}
      />
      <Credit />
    </>
  );
}
