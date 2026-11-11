import { data, redirect } from "react-router";

import { PatrolForm } from "~/components/patrol-form";
import { Credit, TopBar } from "~/components/ui";
import { requireProfile } from "~/lib/auth.server";
import { isSquad } from "~/lib/permissions";
import { createPatrol } from "~/lib/patrols.server";
import { squadPeople } from "~/lib/shifts.server";
import { isDateKey, kyivNow, startOfWeek } from "~/lib/time";
import type { Route } from "./+types/work-patrol-new";

export const meta: Route.MetaFunction = () => [
  { title: "Обхід · єГуртожиток" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  if (!isSquad(me)) throw redirect("/work");
  const today = kyivNow().date;
  const asked = new URL(request.url).searchParams.get("date");
  const people = await squadPeople(env);
  return {
    today,
    people,
    initial: {
      date: isDateKey(asked) ? asked : today,
      status: "done" as const,
      notes: null,
      people: people.some((p) => p.id === me.id) ? [me.id] : [],
    },
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  const result = await createPatrol(env, me, await request.formData());
  if (!result) throw redirect("/work");
  if (!result.ok) return data({ errors: result.errors }, { status: 400 });
  throw redirect(
    result.taskId
      ? `/work/tasks/${result.taskId}`
      : `/work/schedule?w=${startOfWeek(result.date)}`,
  );
}

export default function NewPatrol({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <>
      <TopBar back="/work/schedule" title="Обхід" />
      <PatrolForm
        {...loaderData}
        withCard
        errors={actionData?.errors}
        submitLabel="Зберегти"
      />
      <Credit />
    </>
  );
}
