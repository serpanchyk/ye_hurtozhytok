import { Form, data, redirect } from "react-router";

import { ConfirmButton } from "~/components/controls";
import { ShiftForm } from "~/components/shift-form";
import { Credit, TopBar } from "~/components/ui";
import { requireProfile } from "~/lib/auth.server";
import { canStandShift, leadsSquad } from "~/lib/permissions";
import {
  deleteShift,
  getShift,
  squadPeopleWith,
  updateShift,
} from "~/lib/shifts.server";
import { kyivNow, startOfWeek } from "~/lib/time";
import type { Route } from "./+types/work-shift-edit";

export const meta: Route.MetaFunction = () => [
  { title: "Змінити вахту · єГуртожиток" },
];

const NOT_YOURS = "Змінити цю вахту може той, хто її додав, або голова загону.";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  const s = await getShift(env, me, Number(params.id));
  if (!s) throw new Response(NOT_YOURS, { status: 403 });
  const people = await squadPeopleWith(
    env,
    s.residentId === null ? [] : [s.residentId],
  );
  return {
    today: kyivNow().date,
    shift: s,
    canSelf: canStandShift(me),
    who:
      s.residentId === null
        ? "free"
        : s.residentId === me.id
          ? "me"
          : String(s.residentId),
    // Those who lead pick anyone; others may keep whoever is on it.
    people: people.filter(
      (p) => p.id !== me.id && (leadsSquad(me) || p.id === s.residentId),
    ),
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  const id = Number(params.id);
  const form = await request.formData();
  if (form.get("intent") === "delete") {
    const date = await deleteShift(env, me, id);
    if (!date) throw new Response(NOT_YOURS, { status: 403 });
    throw redirect(`/work/schedule?w=${startOfWeek(date)}`);
  }
  const result = await updateShift(env, me, id, form);
  if (!result) throw new Response(NOT_YOURS, { status: 403 });
  if (!result.ok) return data({ errors: result.errors }, { status: 400 });
  throw redirect(`/work/schedule?w=${startOfWeek(result.date)}`);
}

export default function EditShift({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { today, shift, canSelf, who, people } = loaderData;
  return (
    <>
      <TopBar
        back={`/work/schedule?w=${startOfWeek(shift.date)}`}
        title="Змінити вахту"
      />
      <ShiftForm
        today={today}
        date={shift.date}
        who={who}
        note={shift.note}
        people={people}
        canSelf={canSelf}
        errors={actionData?.errors}
        submitLabel="Зберегти"
      />
      <Form method="post" className="confirm-form" style={{ marginTop: 10 }}>
        <ConfirmButton
          className="btn btn-ghost-danger block"
          name="intent"
          value="delete"
          question="Видалити цю вахту?"
          yes="Так, видалити"
        >
          Видалити
        </ConfirmButton>
      </Form>
      <Credit />
    </>
  );
}
