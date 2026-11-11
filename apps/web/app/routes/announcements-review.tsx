import { AnnouncementRow } from "~/components/announcement";
import { Credit, TopBar } from "~/components/ui";
import { agoLabel } from "~/lib/announcements";
import { listPending } from "~/lib/announcements.server";
import { requireProfile } from "~/lib/auth.server";
import { canDecideAnnouncements } from "~/lib/permissions";
import { kyivDateKey, kyivNow } from "~/lib/time";
import { sectionBack } from "~/lib/work-section.server";
import type { Route } from "./+types/announcements-review";

export const meta: Route.MetaFunction = () => [
  { title: "Пропозиції оголошень · єГуртожиток" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  if (!canDecideAnnouncements(me))
    throw new Response("Ця сторінка для студради й розпорядника.", {
      status: 403,
    });
  const today = kyivNow().date;
  const list = await listPending(env);
  return {
    back: await sectionBack(request, me, ["council", "manager"]),
    list: list.map((a) => ({
      ...a,
      sub: `${a.author}${a.room ? `, ${a.room}` : ""} · ${agoLabel(kyivDateKey(a.createdAt), today)}`,
    })),
  };
}

export default function Review({ loaderData }: Route.ComponentProps) {
  const { back, list } = loaderData;
  return (
    <>
      <TopBar back={back} title="Пропозиції оголошень" />
      <p className="lede" style={{ margin: "0 4px 14px" }}>
        Від мешканців. Відкрийте пропозицію, щоб опублікувати її або відхилити з
        поясненням для автора.
      </p>
      {list.length ? (
        <div className="ann-list">
          {list.map((a) => (
            <AnnouncementRow
              a={{ ...a, date: null }}
              sub={a.sub}
              to={`/work/announcements/${a.id}`}
              key={a.id}
            />
          ))}
        </div>
      ) : (
        <div className="glass empty">
          <b>Нових пропозицій немає</b>
          Коли хтось запропонує оголошення, прийде сповіщення.
        </div>
      )}
      <Credit />
    </>
  );
}
