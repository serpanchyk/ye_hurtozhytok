import { redirect } from "react-router";

import { Credit, TopBar } from "~/components/ui";
import { requireProfile } from "~/lib/auth.server";
import { isSquad } from "~/lib/permissions";
import { shiftStats } from "~/lib/shifts.server";
import { MONTHS_GENITIVE, kyivNow, monthIndex } from "~/lib/time";
import type { Route } from "./+types/work-stats";

export const meta: Route.MetaFunction = () => [
  { title: "Хто скільки відсидів · єГуртожиток" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  if (!isSquad(me)) throw redirect("/work");
  const today = kyivNow().date;
  return {
    me: me.id,
    month: MONTHS_GENITIVE[monthIndex(today)],
    rows: await shiftStats(env, today),
  };
}

/** «Хто скільки відсидів»: past shifts of everyone in the squad. */
export default function Stats({ loaderData }: Route.ComponentProps) {
  const { me, month, rows } = loaderData;
  return (
    <>
      <TopBar back="/work?s=squad" title="Хто скільки відсидів" />
      <p className="lede" style={{ margin: "0 4px 14px" }}>
        Минулі вахти за весь час і з 1 {month}.
      </p>
      <div className="glass" style={{ padding: "4px 0" }}>
        {rows.map((r) => (
          <div className="list-row" key={r.id}>
            <span
              className="who-av"
              style={
                r.id === me
                  ? { background: "var(--mine)", color: "#fff" }
                  : undefined
              }
            >
              {r.place}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <b>{r.name}</b>
              <span className="sub">
                {r.month} з 1 {month}
              </span>
            </span>
            <b className="stat-total">{r.total}</b>
          </div>
        ))}
      </div>
      <Credit />
    </>
  );
}
