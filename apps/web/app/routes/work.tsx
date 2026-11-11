import { Link, redirect } from "react-router";

import { Credit, Icon, LinkRow, TopBar } from "~/components/ui";
import { countPending } from "~/lib/announcements.server";
import { listAppComplaints } from "~/lib/complaints.server";
import { requireProfile } from "~/lib/auth.server";
import { canPublishAnnouncements, leadsSquad } from "~/lib/permissions";
import { workSectionsFor } from "~/lib/sections";
import type { Route } from "./+types/work";

export const meta: Route.MetaFunction = ({ data }) => [
  { title: `${data?.label ?? "Робота"} · єГуртожиток` },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  const mine = workSectionsFor(me);
  // Work sections are for people with a role; everyone else has none.
  if (mine.length === 0) throw redirect("/services");
  const asked = new URL(request.url).searchParams.get("s");
  const found = mine.find((s) => s.id === asked) ?? mine[0];
  const section = found.id;
  return {
    leads: leadsSquad(me),
    label: found.label,
    section,
    pending:
      section === "council" && canPublishAnnouncements(me)
        ? await countPending(env)
        : 0,
    appComplaints:
      section === "manager" ? (await listAppComplaints(env)).length : 0,
  };
}

export default function Work({ loaderData }: Route.ComponentProps) {
  const { label, section, pending, appComplaints, leads } = loaderData;
  return (
    <>
      <TopBar back="/services" />
      <h2 className="title" style={{ marginBottom: 16 }}>
        {label}
      </h2>

      <div className="glass" style={{ padding: "4px 0" }}>
        {section === "council" && (
          <>
            <LinkRow
              to="/work/board?b=council"
              icon="board"
              title="Дошка студради"
              sub="Усі картки, приватні теж"
            />
            <LinkRow
              to="/work/announcements/review"
              icon="horn"
              title="Пропозиції оголошень"
              sub={pending ? "Чекають рішення" : "Нових немає"}
              count={pending}
            />
            <LinkRow
              to="/work/announcements/new"
              icon="plus"
              title="Нове оголошення"
              sub="Одразу для всіх"
            />
            <LinkRow
              to="/residents"
              icon="user"
              title="Мешканці"
              sub="Хто зареєструвався й де живе"
            />
          </>
        )}
        {section === "squad" && (
          <>
            <LinkRow
              to="/work/schedule"
              icon="shield"
              title="Графік вахт"
              sub="Вахти й обходи цього тижня"
            />
            <LinkRow
              to="/work/stats"
              icon="clock"
              title="Хто скільки відсидів"
              sub="Минулі вахти кожного"
            />
            {leads && (
              <a className="list-row" href="/work/export" download>
                <span className="who-av">
                  <Icon name="cal" small />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>Завантажити Excel</b>
                  <span className="sub">
                    Вахти, обходи, завдання, загін і журнал змін
                  </span>
                </span>
              </a>
            )}
            <LinkRow
              to="/work/board?b=squad"
              icon="board"
              title="Дошка загону"
              sub="Усі картки, приватні теж"
            />
            <LinkRow
              to="/work/tasks/new?b=squad"
              icon="plus"
              title="Нова картка"
              sub="На дошку загону"
            />
          </>
        )}
        {section === "manager" && (
          <>
            <LinkRow
              to="/residents"
              icon="shield"
              title="Мешканці й ролі"
              sub="Видати й зняти ролі, заблокувати"
            />
            <LinkRow
              to="/work/complaints"
              icon="mail"
              title="Звернення про застосунок"
              sub={appComplaints ? "Чекають відповіді" : "Нових немає"}
              count={appComplaints}
            />
          </>
        )}
      </div>
      <Credit />
    </>
  );
}
