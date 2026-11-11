import { Link, redirect } from "react-router";

import { Credit, TopBar } from "~/components/ui";
import { agoLabel } from "~/lib/announcements";
import { requireProfile } from "~/lib/auth.server";
import { listAppComplaints } from "~/lib/complaints.server";
import { isSiteManager } from "~/lib/permissions";
import { kyivDateKey, kyivNow } from "~/lib/time";
import type { Route } from "./+types/work-complaints";

export const meta: Route.MetaFunction = () => [
  { title: "Звернення про застосунок · єГуртожиток" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  if (!isSiteManager(me)) throw redirect("/work");
  const today = kyivNow().date;
  return {
    list: (await listAppComplaints(env)).map((c) => ({
      ...c,
      ago: agoLabel(kyivDateKey(c.createdAt), today),
    })),
  };
}

/** Complaints about the app: they have no card, the site manager closes them here. */
export default function WorkComplaints({ loaderData }: Route.ComponentProps) {
  const { list } = loaderData;
  return (
    <>
      <TopBar back="/work?s=manager" title="Про застосунок" />
      {list.length ? (
        <div className="glass" style={{ padding: "4px 0" }}>
          {list.map((c) => (
            <Link
              viewTransition
              className="list-row"
              to={`/work/complaints/${c.id}`}
              key={c.id}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{c.body.length > 80 ? `${c.body.slice(0, 80)}…` : c.body}</b>
                <span className="sub">
                  {c.author} · {c.ago}
                </span>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="glass empty">
          <b>Нових звернень немає</b>
          Коли хтось напише про застосунок, прийде сповіщення.
        </div>
      )}
      <Credit />
    </>
  );
}
