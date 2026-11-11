import { Form, Link, data, redirect, useNavigation } from "react-router";

import { ConfirmButton } from "~/components/controls";
import { Credit, Icon, TopBar } from "~/components/ui";
import { requireProfile } from "~/lib/auth.server";
import { isSquad } from "~/lib/permissions";
import { weekPatrols } from "~/lib/patrols.server";
import { leaveShift, signShift, weekOfShifts } from "~/lib/shifts.server";
import {
  addDays,
  dateLong,
  dayName,
  isDateKey,
  kyivNow,
  startOfWeek,
} from "~/lib/time";
import { usePolling } from "~/lib/use-polling";
import type { Route } from "./+types/work-schedule";

export const meta: Route.MetaFunction = () => [
  { title: "Графік вахт · єГуртожиток" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  if (!isSquad(me)) throw redirect("/work");
  const today = kyivNow().date;
  const w = new URL(request.url).searchParams.get("w");
  const monday = startOfWeek(isDateKey(w) ? w : today);
  const [days, patrols] = await Promise.all([
    weekOfShifts(env, me, monday, today),
    weekPatrols(env, me, monday),
  ]);
  return {
    monday,
    prev: addDays(monday, -7),
    next: addDays(monday, 7),
    thisWeek: monday === startOfWeek(today),
    range: `${dateLong(monday)} — ${dateLong(addDays(monday, 6))}`,
    days: days.map((d) => ({
      ...d,
      label: dayName(d.date, today),
      patrols: patrols.filter((p) => p.date === d.date),
    })),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  const form = await request.formData();
  const id = Number(form.get("shift"));
  const intent = form.get("intent");
  const error =
    intent === "sign"
      ? await signShift(env, me, id)
      : intent === "leave"
        ? await leaveShift(env, me, id)
        : "Невідома дія.";
  return error ? data({ error }, { status: 400 }) : null;
}

/** The squad's week: who is on duty each day, free shifts to take, «Не зможу». */
export default function Schedule({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  usePolling(30_000);
  const { monday, prev, next, thisWeek, range, days } = loaderData;
  // Adding from another week starts on that week and comes back to it.
  const week = thisWeek ? "" : `?date=${monday}`;
  const busy = useNavigation().state === "submitting";
  return (
    <>
      <TopBar back="/work?s=squad" title="Графік вахт" />
      <div className="week-nav">
        <Link
          className="icon-btn"
          to={`?w=${prev}`}
          replace
          preventScrollReset
          aria-label="Попередній тиждень"
        >
          <Icon name="back" />
        </Link>
        <b>{range}</b>
        <Link
          className="icon-btn"
          to={`?w=${next}`}
          replace
          preventScrollReset
          aria-label="Наступний тиждень"
        >
          <Icon name="chev" />
        </Link>
      </div>
      {!thisWeek && (
        <p style={{ margin: "0 4px", textAlign: "center" }}>
          <Link className="link" to="?" replace preventScrollReset>
            До цього тижня
          </Link>
        </p>
      )}
      {actionData?.error && (
        <p className="error-note" role="alert">
          {actionData.error}
        </p>
      )}

      {days.map((d) => (
        <section key={d.date}>
          <div className="section-h">
            <h3>{d.label}</h3>
          </div>
          {!d.duty && d.patrols.length === 0 && (
            <p className="muted" style={{ margin: "0 4px 8px" }}>
              Вахт немає
            </p>
          )}
          {(d.duty || d.patrols.length > 0) && (
            <div className="glass" style={{ padding: "4px 0" }}>
              {/* A Friday patrol: say there is no duty inside the day, not above it. */}
              {!d.duty && (
                <div className="list-row">
                  <span className="who-av">
                    <Icon name="shield" small />
                  </span>
                  <span className="muted" style={{ flex: 1, minWidth: 0 }}>
                    Вахти немає
                  </span>
                </div>
              )}
              {d.duty && (
                <div className="list-row">
                  <span
                    className="who-av"
                    style={
                      d.shift?.mine
                        ? { background: "var(--mine)", color: "#fff" }
                        : undefined
                    }
                  >
                    <Icon name="shield" small />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>
                      {d.shift
                        ? (d.shift.name ?? "Вільно")
                        : d.past
                          ? "Вахти не було"
                          : "Вахти ще немає"}
                    </b>
                    {d.shift?.note && (
                      <span className="sub">{d.shift.note}</span>
                    )}
                  </span>
                  {d.shift?.canSign && (
                    <Form method="post" preventScrollReset>
                      <input type="hidden" name="shift" value={d.shift.id} />
                      <button
                        className="pill-btn"
                        name="intent"
                        value="sign"
                        disabled={busy}
                      >
                        Записатися
                      </button>
                    </Form>
                  )}
                  {d.shift?.canLeave && (
                    <Form method="post" preventScrollReset>
                      <input type="hidden" name="shift" value={d.shift.id} />
                      {d.shift.mine ? (
                        <button
                          className="pill-btn"
                          name="intent"
                          value="leave"
                          disabled={busy}
                        >
                          Не зможу
                        </button>
                      ) : (
                        // Taking someone else off asks first, like cancelling a booking.
                        <ConfirmButton
                          variant="arm"
                          className="pill-btn"
                          name="intent"
                          value="leave"
                          label={`Зняти з вахти: ${d.shift.name}, ${d.label}`}
                          question={`Зняти з вахти: ${d.shift.name}?`}
                          yes="Точно?"
                        >
                          Зняти
                        </ConfirmButton>
                      )}
                    </Form>
                  )}
                  {d.shift?.canEdit && (
                    <Link
                      className="pill-btn"
                      to={`/work/shifts/${d.shift.id}/edit`}
                      aria-label={`Змінити вахту: ${d.label}`}
                    >
                      <Icon name="pencil" small />
                    </Link>
                  )}
                  {!d.shift && !d.past && (
                    <Link
                      className="pill-btn"
                      to={`/work/shifts/new?date=${d.date}`}
                    >
                      Додати
                    </Link>
                  )}
                </div>
              )}
              {d.patrols.map((p) => (
                <div className="list-row" key={p.id}>
                  <span className="who-av">
                    <Icon name="walk" small />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{p.planned ? "Обхід · плануємо" : "Обхід"}</b>
                    <span className="sub clamp">{p.people.join(", ")}</span>
                  </span>
                  {p.canEdit && (
                    <Link
                      className="pill-btn"
                      to={`/work/patrols/${p.id}/edit`}
                      aria-label={`Змінити обхід: ${d.label}`}
                    >
                      <Icon name="pencil" small />
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      ))}

      <div className="home-actions">
        <Link
          viewTransition
          className="btn btn-soft block"
          to={`/work/shifts/new${week}`}
        >
          <Icon name="plus" />
          Нова вахта
        </Link>
        <Link
          viewTransition
          className="btn btn-soft block"
          to={`/work/patrols/new${week}`}
        >
          <Icon name="walk" />
          Обхід
        </Link>
      </div>
      <Credit />
    </>
  );
}
