import { Link } from "react-router";

import { Credit, Icon, TopBar, type IconName } from "~/components/ui";
import { countPending } from "~/lib/announcements.server";
import { requireProfile } from "~/lib/auth.server";
import {
  canDecideAnnouncements,
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
  const pending = canDecideAnnouncements(me) ? await countPending(env) : 0;
  return {
    // A tile per work section the person has.
    work: workSectionsFor(me).map((s) => ({ ...s, to: workHref(s.id) })),
    // Everyone has the announcement tile: residents propose, those who
    // publish post at once.
    announce: canPublishAnnouncements(me)
      ? { to: "/work/announcements/new", title: "Нове оголошення" }
      : canProposeAnnouncement(me)
        ? { to: "/announcements/new", title: "Запропонувати оголошення" }
        : null,
    // What waits: proposals for the council, proposals and complaints about
    // the app for the site manager.
    waiting: {
      council: pending,
      squad: 0,
      manager: isSiteManager(me)
        ? pending + (await listAppComplaints(env)).length
        : 0,
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
      {count ? (
        <span className="count-pill">
          {count}
          <span className="sr-only">, чекають</span>
        </span>
      ) : null}
      <b>{title}</b>
    </Link>
  );
}

/** Every service of the dormitory in one place; the bottom menu stays short. */
export default function Services({ loaderData }: Route.ComponentProps) {
  const { work, announce, waiting } = loaderData;
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
        {announce && (
          <Tile to={announce.to} icon="horn" title={announce.title} />
        )}
      </nav>
      {work.length > 0 && (
        <>
          <div className="section-h">
            <h3>Праця</h3>
            <span className="muted">для вашої ролі</span>
          </div>
          <nav className="service-grid" aria-label="Праця">
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
        </>
      )}
      <Credit />
    </>
  );
}
