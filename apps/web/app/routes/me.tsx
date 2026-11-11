import { Link } from "react-router";

import { Credit, Icon, LinkRow } from "~/components/ui";
import { StatusPill } from "~/components/announcement";
import { ComplaintRows } from "~/components/complaint";
import { agoLabel } from "~/lib/announcements";
import { listMine } from "~/lib/announcements.server";
import { listMyComplaints } from "~/lib/complaints.server";
import { requireProfile } from "~/lib/auth.server";
import { MAX_ACTIVE, durationLabel, fmtMin } from "~/lib/booking";
import { upcomingFor } from "~/lib/bookings.server";
import { initials, roomLabel } from "~/lib/profile";
import {
  canProposeAnnouncement,
  canPublishAnnouncements,
} from "~/lib/permissions";
import { ROLE_LABELS } from "~/lib/roles";
import { dayName, kyivDateKey, kyivNow } from "~/lib/time";
import type { Route } from "./+types/me";

export const handle = { tab: "me" };
export const meta: Route.MetaFunction = () => [{ title: "Моє · єГуртожиток" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const r = await requireProfile(request, env);
  const now = kyivNow();
  const [list, proposals, complaints] = await Promise.all([
    upcomingFor(env, r.id, now),
    listMine(env, r.id),
    listMyComplaints(env, r.id),
  ]);
  return {
    name: r.name,
    room: r.room,
    telegram: r.telegram,
    blocked: r.blocked,
    roles: r.roles.map((role) => ROLE_LABELS[role]),
    // Those who publish post from the work pages and never have proposals.
    proposes: canProposeAnnouncement(r) && !canPublishAnnouncements(r),
    proposals: proposals.map((a) => ({
      id: a.id,
      title: a.title,
      status: a.status,
      reason: a.rejectReason,
    })),
    complaints: complaints.map((c) => ({
      ...c,
      ago: agoLabel(kyivDateKey(c.createdAt), now.date),
    })),
    today: now.date,
    bookings: list.map((b) => ({
      id: b.id,
      date: b.date,
      startMin: b.startMin,
      endMin: b.endMin,
      machine: b.machineName,
      running: b.date === now.date && b.startMin <= now.minute,
    })),
  };
}

export default function Me({ loaderData }: Route.ComponentProps) {
  const p = loaderData;
  return (
    <>
      <div className="me" style={{ marginTop: 4 }}>
        <span className="me-av" aria-hidden="true">
          {initials(p.name)}
        </span>
        <div>
          <b>{p.name}</b>
          <span>
            {roomLabel(p.room)}
            {p.telegram ? ` · @${p.telegram}` : ""}
          </span>
        </div>
      </div>
      {p.roles.length > 0 && (
        <p className="role-tags" aria-label="Ваші ролі">
          {p.roles.map((label) => (
            <span className="council-tag" key={label}>
              {label}
            </span>
          ))}
        </p>
      )}
      {p.blocked && (
        <p className="error-note" role="alert">
          Ваш акаунт заблоковано: записуватися зараз не можна.
        </p>
      )}

      <div className="section-h">
        <h3>Мої прання</h3>
        <Link to="/laundry">Пральня</Link>
      </div>
      {p.bookings.length ? (
        <div className="glass" style={{ padding: "4px 0" }}>
          {p.bookings.map((b) => (
            <Link
              viewTransition
              className="list-row"
              to={`/bookings/${b.id}`}
              key={b.id}
            >
              <span
                className="who-av"
                style={
                  b.running
                    ? { background: "var(--mine)", color: "#fff" }
                    : { background: "var(--mine-soft)", color: "var(--mine)" }
                }
              >
                <Icon name="clock" small />
              </span>
              <span style={{ flex: 1 }}>
                <b>
                  {dayName(b.date, p.today)} · {fmtMin(b.startMin)}–
                  {fmtMin(b.endMin)}
                </b>
                <span className="sub">
                  {b.machine} ·{" "}
                  {b.running
                    ? "зараз ваш час"
                    : durationLabel(b.endMin - b.startMin)}
                </span>
              </span>
              <Icon name="chev" small />
            </Link>
          ))}
        </div>
      ) : (
        <div className="glass empty">
          <b>Записів немає</b>
          Записатися можна в «Пральні».
        </div>
      )}
      <p className="muted" style={{ margin: "10px 4px 0", fontSize: 13.5 }}>
        Одночасно можна мати до {MAX_ACTIVE} записів.
      </p>

      <div className="section-h">
        <h3>Мої звернення</h3>
        <Link to="/complaints/new">Написати</Link>
      </div>
      {p.complaints.length ? (
        <ComplaintRows list={p.complaints} />
      ) : (
        <div className="glass empty">
          <b>Звернень немає</b>
          Написати можна в «Послуги → Звернення».
        </div>
      )}

      {p.proposes && (
        <>
          <div className="section-h">
            <h3>Мої пропозиції оголошень</h3>
            <Link to="/announcements/new">Запропонувати</Link>
          </div>
          {p.proposals.length ? (
            <div className="glass" style={{ padding: "4px 0" }}>
              {p.proposals.map((a) => (
                <Link
                  viewTransition
                  className="list-row"
                  to={`/announcements/${a.id}`}
                  key={a.id}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{a.title}</b>
                    <span className="sub">
                      {a.status === "pending"
                        ? "Студрада ще не вирішила"
                        : a.reason}
                    </span>
                  </span>
                  <StatusPill status={a.status} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="glass empty">
              <b>Пропозицій немає</b>
              Запропонувати оголошення можна в «Послугах».
            </div>
          )}
        </>
      )}

      <div className="section-h">
        <h3>Налаштування</h3>
      </div>
      <div className="glass" style={{ padding: "4px 0" }}>
        <LinkRow
          to="/profile"
          icon="user"
          title="Профіль і сповіщення"
          sub="Кімната, Telegram, нагадування, вихід"
        />
      </div>

      <Credit />
    </>
  );
}
