import { Link } from "react-router";

import { Credit, Icon, TopBar, type IconName } from "~/components/ui";
import { countPending } from "~/lib/announcements.server";
import { requireProfile } from "~/lib/auth.server";
import {
  canProposeAnnouncement,
  canPublishAnnouncements,
  isSiteManager,
} from "~/lib/permissions";
import { listAppComplaints } from "~/lib/complaints.server";
import { workHref, workSectionsFor } from "~/lib/sections";
import type { Route } from "./+types/services";

export const handle = { tab: "services" };
export const meta: Route.MetaFunction = () => [
  { title: "Послуги · єГуртожиток" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  return {
    // A tile per work section the person has.
    work: workSectionsFor(me).map((s) => ({ ...s, to: workHref(s.id) })),
    // Those who publish post from their section; everyone else proposes here.
    propose: canProposeAnnouncement(me) && !canPublishAnnouncements(me),
    // What waits: proposals for the council, complaints about the app for
    // the site manager.
    waiting: {
      council: canPublishAnnouncements(me) ? await countPending(env) : 0,
      squad: 0,
      manager: isSiteManager(me) ? (await listAppComplaints(env)).length : 0,
    },
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
  const { work, propose, waiting } = loaderData;
  return (
    <>
      <TopBar />
      <h2 className="title" style={{ marginBottom: 16 }}>
        Послуги
      </h2>
      <nav className="service-grid" aria-label="Послуги">
        <Tile to="/laundry" icon="washer" title="Пральня" />
        <Tile to="/board" icon="board" title="Дошка" />
        <Tile to="/complaints" icon="mail" title="Звернення" />
        {propose && (
          <Tile
            to="/announcements/new"
            icon="horn"
            title="Запропонувати оголошення"
          />
        )}
        {work.map((s) => (
          <Tile
            key={s.id}
            to={s.to}
            icon={s.icon}
            title={s.label}
            count={waiting[s.id]}
          />
        ))}
      </nav>
      <Credit />
    </>
  );
}
