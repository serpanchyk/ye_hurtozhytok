import { Credit, LinkRow, SectionBar } from "~/components/ui";
import { countPending } from "~/lib/announcements.server";
import { requireProfile } from "~/lib/auth.server";
import { canPublishAnnouncements, isCouncil, isSquad } from "~/lib/permissions";
import type { Route } from "./+types/services";

export const handle = { tab: "services" };
export const meta: Route.MetaFunction = () => [
  { title: "Послуги · єГуртожиток" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  return {
    name: me.name,
    // «Праця» is only for people with a role.
    work: isCouncil(me) || isSquad(me),
    pending: canPublishAnnouncements(me) ? await countPending(env) : 0,
  };
}

/** Every service of the dormitory in one place; the bottom menu stays short. */
export default function Services({ loaderData }: Route.ComponentProps) {
  const { name, work, pending } = loaderData;
  return (
    <>
      <SectionBar name={name} />
      <h2 className="title" style={{ marginBottom: 16 }}>
        Послуги
      </h2>
      <div className="glass" style={{ padding: "4px 0" }}>
        <LinkRow
          to="/laundry"
          icon="washer"
          title="Пральня"
          sub="Записатися на пралку, мої записи, пралки зараз"
        />
        <LinkRow
          to="/board"
          icon="board"
          title="Дошка"
          sub="Над чим працюють студрада й оперзагін"
        />
        {work && (
          <LinkRow
            to="/work"
            icon="work"
            title="Праця"
            sub="Робота студради, загону й розпорядника"
            count={pending}
          />
        )}
      </div>
      <Credit />
    </>
  );
}
