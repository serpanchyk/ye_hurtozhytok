import { Link, redirect } from "react-router";

import { PillGroup } from "~/components/pill-group";
import { Credit, LinkRow, SectionBar } from "~/components/ui";
import { countPending } from "~/lib/announcements.server";
import { requireProfile } from "~/lib/auth.server";
import {
  canPublishAnnouncements,
  isCouncil,
  isSiteManager,
  isSquad,
} from "~/lib/permissions";
import type { Route } from "./+types/work";

export const handle = { tab: "work" };
export const meta: Route.MetaFunction = () => [
  { title: "Праця · єГуртожиток" },
];

const SECTIONS = [
  { id: "council", label: "Студрада" },
  { id: "squad", label: "Оперзагін" },
  { id: "manager", label: "Розпорядник" },
] as const;
type Section = (typeof SECTIONS)[number]["id"];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  const mine = SECTIONS.filter((s) =>
    s.id === "council"
      ? isCouncil(me)
      : s.id === "squad"
        ? isSquad(me)
        : isSiteManager(me),
  );
  // «Праця» is for people with a role; everyone else has nothing here.
  if (mine.length === 0) throw redirect("/me");
  const asked = new URL(request.url).searchParams.get("s");
  const section: Section = mine.find((s) => s.id === asked)?.id ?? mine[0].id;
  return {
    name: me.name,
    sections: mine.map((s) => ({ id: s.id, label: s.label })),
    section,
    pending:
      section === "council" && canPublishAnnouncements(me)
        ? await countPending(env)
        : 0,
  };
}

export default function Work({ loaderData }: Route.ComponentProps) {
  const { name, sections, section, pending } = loaderData;
  return (
    <>
      <SectionBar name={name} />
      <h2 className="title" style={{ marginBottom: 16 }}>
        Праця
      </h2>

      {sections.length > 1 && (
        <PillGroup className="seg" label="Роль" style={{ marginBottom: 14 }}>
          {sections.map((s) => (
            <Link
              data-pill-item
              key={s.id}
              to={`?s=${s.id}`}
              replace
              preventScrollReset
              aria-current={s.id === section ? "true" : undefined}
            >
              {s.label}
            </Link>
          ))}
        </PillGroup>
      )}

      <div className="glass" style={{ padding: "4px 0" }}>
        {section === "council" && (
          <>
            <LinkRow
              to="/board?b=council"
              icon="board"
              title="Дошка студради"
              sub="Усі картки, приватні теж"
            />
            <LinkRow
              to="/announcements/review"
              icon="horn"
              title="Пропозиції оголошень"
              sub={pending ? "Чекають рішення" : "Нових немає"}
              count={pending}
            />
            <LinkRow
              to="/announcements/new"
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
              to="/board?b=squad"
              icon="board"
              title="Дошка загону"
              sub="Усі картки, приватні теж"
            />
            <LinkRow
              to="/tasks/new?b=squad"
              icon="plus"
              title="Нова картка"
              sub="На дошку загону"
            />
          </>
        )}
        {section === "manager" && (
          <LinkRow
            to="/residents"
            icon="shield"
            title="Мешканці й ролі"
            sub="Видати й зняти ролі, заблокувати"
          />
        )}
      </div>
      <Credit />
    </>
  );
}
