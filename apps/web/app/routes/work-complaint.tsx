import { data, redirect } from "react-router";

import { ComplaintActions, ComplaintDetails } from "~/components/complaint";
import { Credit, TopBar } from "~/components/ui";
import { agoLabel } from "~/lib/announcements";
import { requireProfile } from "~/lib/auth.server";
import { decideComplaint, getComplaint } from "~/lib/complaints.server";
import { kyivDateKey, kyivNow } from "~/lib/time";
import type { Route } from "./+types/work-complaint";

export const meta: Route.MetaFunction = () => [
  { title: "Звернення · єГуртожиток" },
];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  const c = await getComplaint(env, me, Number(params.id));
  if (!c) throw new Response("Такого звернення немає.", { status: 404 });
  // One with a card is handled on its card; the author reads their own.
  if (c.taskId && c.canHandle) throw redirect(`/work/tasks/${c.taskId}`);
  if (!c.canHandle) throw redirect(`/complaints/${c.id}`);
  return {
    c,
    created: agoLabel(kyivDateKey(c.createdAt), kyivNow().date),
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const { env, ctx } = context.cloudflare;
  const me = await requireProfile(request, env);
  const form = await request.formData();
  const intent = form.get("intent");
  if (intent !== "answer" && intent !== "reject" && intent !== "resolve")
    return data({ error: "Невідома дія." }, { status: 400 });
  const result = await decideComplaint(
    env,
    ctx,
    me,
    Number(params.id),
    intent,
    form,
  );
  if (!result.ok) return data({ error: result.error }, { status: 400 });
  return null;
}

/** A complaint about the app, for the site manager: answer, close or turn down. */
export default function WorkComplaint({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { c, created } = loaderData;
  return (
    <>
      <TopBar back="/work/complaints" title="Про застосунок" />
      {actionData?.error && (
        <p className="error-note" role="alert">
          {actionData.error}
        </p>
      )}
      <ComplaintDetails c={c} byline={`Надіслано ${created}`} withAuthor />
      <ComplaintActions
        id={c.id}
        status={c.status}
        reply={c.reply}
        canResolve
      />
      <Credit />
    </>
  );
}
