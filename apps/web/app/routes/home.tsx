import { Link } from "react-router";

import { AnnouncementRow, ImportantCard } from "~/components/announcement";
import { Credit, Icon, TopBar } from "~/components/ui";
import { agoLabel, feedSections } from "~/lib/announcements";
import { listPublished } from "~/lib/announcements.server";
import { requireProfile } from "~/lib/auth.server";
import {
  canProposeAnnouncement,
  canPublishAnnouncements,
} from "~/lib/permissions";
import { vocative } from "~/lib/profile";
import { kyivDateKey, kyivNow } from "~/lib/time";
import { usePolling } from "~/lib/use-polling";
import type { Route } from "./+types/home";

export const handle = { tab: "home" };
export const meta: Route.MetaFunction = () => [{ title: "єГуртожиток" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  const nowMs = Date.now();
  const today = kyivNow(nowMs).date;
  const decider = canPublishAnnouncements(me);
  const list = await listPublished(env, me);
  const s = feedSections(list, today, nowMs);
  const ago = (ms: number | null) =>
    ms ? agoLabel(kyivDateKey(ms), today) : "";
  return {
    firstName: me.firstName ?? me.name.split(" ")[0],
    today,
    canPropose: canProposeAnnouncement(me),
    decider,
    important: s.important,
    upcoming: s.upcoming,
    fresh: s.fresh.map((a) => ({ ...a, ago: ago(a.publishedAt) })),
    more: s.history.length,
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  usePolling(60_000);
  const p = loaderData;
  const first = vocative(p.firstName);
  const empty = p.important.length + p.upcoming.length + p.fresh.length === 0;
  return (
    <>
      <TopBar />
      <h2 className="title" style={{ marginBottom: 16 }}>
        {first ? `Привіт, ${first}` : "Привіт!"}
      </h2>

      <div className="ann-feed">
        {p.important.map((a) => (
          <ImportantCard a={a} today={p.today} key={a.id} />
        ))}

        {p.upcoming.length > 0 && (
          <section>
            <div className="section-h">
              <h3>Найближчі події</h3>
            </div>
            <div className="ann-list">
              {p.upcoming.map((a) => (
                <AnnouncementRow a={a} key={a.id} />
              ))}
            </div>
          </section>
        )}

        {p.fresh.length > 0 && (
          <section>
            <div className="section-h">
              <h3>Нове</h3>
            </div>
            <div className="ann-list">
              {p.fresh.map((a) => (
                <AnnouncementRow a={a} sub={a.ago} key={a.id} />
              ))}
            </div>
          </section>
        )}

        {empty && (
          <div className="glass empty">
            <b>Оголошень поки немає</b>
            Тут будуть збори, відключення води, прибирання й новини гуртожитку.
          </div>
        )}
      </div>

      <div className="home-actions">
        {/* Those who publish post from the work pages; residents propose here. */}
        {p.canPropose && !p.decider && (
          <Link
            viewTransition
            className="btn btn-soft block"
            to="/announcements/new"
          >
            <Icon name="plus" />
            Запропонувати оголошення
          </Link>
        )}
        <Link viewTransition className="history" to="/announcements">
          Усі оголошення
          {p.more > 0 && <small>ще {p.more} в історії</small>}
          <Icon name="chev" small />
        </Link>
      </div>
      <Credit />
    </>
  );
}
