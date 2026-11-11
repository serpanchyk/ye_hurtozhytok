import { Link } from "react-router";

import { Credit, Icon, SectionBar, type IconName } from "~/components/ui";
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

function Tile({
  to,
  icon,
  title,
  count,
}: {
  to: string;
  icon: IconName;
  title: string;
  count?: number;
}) {
  return (
    <Link viewTransition className="glass service-tile" to={to}>
      <span className="who-av">
        <Icon name={icon} small />
      </span>
      {count ? <span className="count-pill">{count}</span> : null}
      <b>{title}</b>
    </Link>
  );
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
      <nav className="service-grid" aria-label="Послуги">
        <Tile to="/laundry" icon="washer" title="Пральня" />
        <Tile to="/board" icon="board" title="Дошка" />
        <Tile to="/complaints" icon="mail" title="Звернення" />
        {work && <Tile to="/work" icon="work" title="Праця" count={pending} />}
      </nav>
      <Credit />
    </>
  );
}
