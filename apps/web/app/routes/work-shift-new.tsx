import { data, redirect } from "react-router";

import { ShiftForm } from "~/components/shift-form";
import { Credit, TopBar } from "~/components/ui";
import { requireProfile } from "~/lib/auth.server";
import { canStandShift, isSquad, leadsSquad } from "~/lib/permissions";
import { nextDutyDate } from "~/lib/shifts";
import { createShift, squadPeople } from "~/lib/shifts.server";
import { isDateKey, kyivNow, startOfWeek } from "~/lib/time";
import type { Route } from "./+types/work-shift-new";

export const meta: Route.MetaFunction = () => [
  { title: "Нова вахта · єГуртожиток" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  if (!isSquad(me)) throw redirect("/work");
  const today = kyivNow().date;
  const asked = new URL(request.url).searchParams.get("date");
  const canSelf = canStandShift(me);
  const date = nextDutyDate(isDateKey(asked) && asked >= today ? asked : today);
  return {
    today,
    date,
    back: `/work/schedule?w=${startOfWeek(isDateKey(asked) ? asked : today)}`,
    canSelf,
    who: canSelf ? "me" : "free",
    people: leadsSquad(me)
      ? (await squadPeople(env)).filter((p) => p.id !== me.id)
      : [],
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  const result = await createShift(env, me, await request.formData());
  if (!result) throw redirect("/work");
  if (!result.ok) return data({ errors: result.errors }, { status: 400 });
  throw redirect(`/work/schedule?w=${startOfWeek(result.date)}`);
}

export default function NewShift({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { today, date, canSelf, who, people } = loaderData;
  return (
    <>
      <TopBar back={loaderData.back} title="Нова вахта" />
      <ShiftForm
        today={today}
        date={date}
        who={who}
        note={null}
        people={people}
        canSelf={canSelf}
        errors={actionData?.errors}
        submitLabel="Додати"
      />
      <Credit />
    </>
  );
}
