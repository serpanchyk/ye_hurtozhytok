import { Link } from "react-router";

import { ComplaintPill } from "~/components/complaint";
import { Credit, Icon, TopBar } from "~/components/ui";
import { agoLabel } from "~/lib/announcements";
import { requireProfile } from "~/lib/auth.server";
import { MAX_OPEN } from "~/lib/complaints";
import { listMyComplaints } from "~/lib/complaints.server";
import { canWriteComplaint } from "~/lib/permissions";
import { kyivDateKey, kyivNow } from "~/lib/time";
import type { Route } from "./+types/complaints";

export const handle = { tab: "services" };
export const meta: Route.MetaFunction = () => [
  { title: "Звернення · єГуртожиток" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  const today = kyivNow().date;
  const list = await listMyComplaints(env, me.id);
  return {
    canWrite: canWriteComplaint(me),
    list: list.map((c) => ({
      ...c,
      ago: agoLabel(kyivDateKey(c.createdAt), today),
    })),
  };
}

/** The resident's own complaints and a way to write a new one. */
export default function Complaints({ loaderData }: Route.ComponentProps) {
  const { canWrite, list } = loaderData;
  return (
    <>
      <TopBar back="/services" />
      <h2 className="title" style={{ marginBottom: 6 }}>
        Звернення
      </h2>
      <p className="lede" style={{ marginBottom: 14 }}>
        Поломка, бруд, шум чи сторонні — напишіть, і звернення одразу потрапить
        до студради чи оперзагону. Тут видно, що з ним відбувається.
      </p>
      {canWrite && (
        <div className="home-actions" style={{ marginTop: 0 }}>
          <Link
            viewTransition
            className="btn btn-primary block"
            to="/complaints/new"
          >
            <Icon name="plus" />
            Написати звернення
          </Link>
        </div>
      )}

      <div className="section-h">
        <h3>Мої звернення</h3>
      </div>
      {list.length ? (
        <div className="glass" style={{ padding: "4px 0" }}>
          {list.map((c) => (
            <Link
              viewTransition
              className="list-row"
              to={`/complaints/${c.id}`}
              key={c.id}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{c.title}</b>
                <span className="sub">{c.ago}</span>
              </span>
              <ComplaintPill status={c.status} />
            </Link>
          ))}
        </div>
      ) : (
        <div className="glass empty">
          <b>Звернень поки немає</b>
          Одночасно можна мати до {MAX_OPEN} незакритих.
        </div>
      )}
      <Credit />
    </>
  );
}
