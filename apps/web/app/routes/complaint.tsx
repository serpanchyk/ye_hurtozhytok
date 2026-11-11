import { redirect } from "react-router";

import { AssigneesRow } from "~/components/board";
import { ComplaintDetails } from "~/components/complaint";
import { Credit, TopBar } from "~/components/ui";
import { agoLabel } from "~/lib/announcements";
import { requireProfile } from "~/lib/auth.server";
import { getComplaint } from "~/lib/complaints.server";
import { kyivDateKey, kyivNow } from "~/lib/time";
import type { Route } from "./+types/complaint";

export const handle = { tab: "services" };
export const meta: Route.MetaFunction = () => [
  { title: "Звернення · єГуртожиток" },
];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  const c = await getComplaint(env, me, Number(params.id));
  if (!c) throw new Response("Такого звернення немає.", { status: 404 });
  // Those who handle it work with it in «Праця».
  if (!c.mine)
    throw redirect(
      c.taskId ? `/work/tasks/${c.taskId}` : `/work/complaints/${c.id}`,
    );
  return {
    c,
    created: agoLabel(kyivDateKey(c.createdAt), kyivNow().date),
    sent: new URL(request.url).searchParams.get("sent") === "1",
  };
}

/** The author's view: what they wrote, its state, the reply, who works on it. */
export default function ComplaintPage({ loaderData }: Route.ComponentProps) {
  const { c, created, sent } = loaderData;
  return (
    <>
      <TopBar back="/complaints" title="Звернення" />
      {sent && (
        <p className="ok-note" role="status">
          Надіслано. Коли щось зміниться, прийде сповіщення.
        </p>
      )}
      <ComplaintDetails c={c} byline={`Надіслано ${created}`} />
      {c.taskId && (
        <AssigneesRow names={c.assignees} label="Працюють над ним" />
      )}
      <Credit />
    </>
  );
}
