import { Form, data, redirect } from "react-router";

import { ConfirmButton } from "~/components/controls";
import { PatrolForm } from "~/components/patrol-form";
import { Credit, TopBar } from "~/components/ui";
import { requireProfile } from "~/lib/auth.server";
import { deletePatrol, getPatrol, updatePatrol } from "~/lib/patrols.server";
import { squadPeopleWith } from "~/lib/shifts.server";
import { kyivNow, startOfWeek } from "~/lib/time";
import type { Route } from "./+types/work-patrol-edit";

export const meta: Route.MetaFunction = () => [
  { title: "Змінити обхід · єГуртожиток" },
];

const NOT_YOURS =
  "Змінити цей обхід може той, хто його записав, або голова загону.";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  const p = await getPatrol(env, me, Number(params.id));
  if (!p) throw new Response(NOT_YOURS, { status: 403 });
  return {
    today: kyivNow().date,
    people: await squadPeopleWith(env, p.people),
    initial: {
      date: p.date,
      status: p.status,
      notes: p.notes,
      people: p.people,
    },
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  const id = Number(params.id);
  const form = await request.formData();
  if (form.get("intent") === "delete") {
    const date = await deletePatrol(env, me, id);
    if (!date) throw new Response(NOT_YOURS, { status: 403 });
    throw redirect(`/work/schedule?w=${startOfWeek(date)}`);
  }
  const result = await updatePatrol(env, me, id, form);
  if (!result) throw new Response(NOT_YOURS, { status: 403 });
  if (!result.ok) return data({ errors: result.errors }, { status: 400 });
  throw redirect(`/work/schedule?w=${startOfWeek(result.date)}`);
}

export default function EditPatrol({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { initial } = loaderData;
  return (
    <>
      <TopBar
        back={`/work/schedule?w=${startOfWeek(initial.date)}`}
        title="Змінити обхід"
      />
      <PatrolForm
        {...loaderData}
        withCard={false}
        errors={actionData?.errors}
        submitLabel="Зберегти"
      />
      <Form method="post" className="confirm-form" style={{ marginTop: 10 }}>
        <ConfirmButton
          className="btn btn-ghost-danger block"
          name="intent"
          value="delete"
          question="Видалити цей обхід? Картка з нього лишиться."
          yes="Так, видалити"
        >
          Видалити
        </ConfirmButton>
      </Form>
      <Credit />
    </>
  );
}
