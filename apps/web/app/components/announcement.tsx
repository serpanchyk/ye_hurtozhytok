import { Link } from "react-router";

import { Gallery } from "~/components/gallery";
import { ShareButton } from "~/components/share-button";
import { Icon } from "~/components/ui";
import type { AnnouncementPage } from "~/lib/announcements.server";
import { fmtTime, whenLabel } from "~/lib/announcements";
import {
  MONTHS_SHORT,
  WEEKDAYS_SHORT,
  dayOfMonth,
  monthIndex,
  weekdayIndex,
} from "~/lib/time";

/** A stored picture; served by the Worker after a permission check. */
export function mediaUrl(key: string) {
  return `/media/${key}`;
}

type Item = {
  id: number;
  title: string;
  /** The details as plain text, cut short. */
  excerpt: string | null;
  place: string | null;
  date: string | null;
  startMin: number | null;
  important: boolean;
  status: "pending" | "published" | "rejected";
  cover: string | null;
  imageCount: number;
};

/** Weekday, day number and month, like a tear-off calendar leaf. */
export function CalendarLeaf({ date }: { date: string }) {
  return (
    <span className="cal-leaf" aria-hidden="true">
      <small>{WEEKDAYS_SHORT[weekdayIndex(date)]}</small>
      <b>{dayOfMonth(date)}</b>
      <i>{MONTHS_SHORT[monthIndex(date)]}</i>
    </span>
  );
}

export function StatusPill({
  status,
}: {
  status: "pending" | "published" | "rejected";
}) {
  if (status === "pending")
    return <span className="st review">На розгляді</span>;
  if (status === "rejected") return <span className="st no">Відхилено</span>;
  return null;
}

/** The important announcement: the largest card on the home page. */
export function ImportantCard({ a, today }: { a: Item; today: string }) {
  const when = whenLabel(a.date, null, today);
  return (
    <Link
      viewTransition
      className="glass ann-hero"
      to={`/announcements/${a.id}`}
    >
      {a.cover && (
        <img
          className="ann-cover"
          src={mediaUrl(a.cover)}
          alt=""
          loading="lazy"
          decoding="async"
        />
      )}
      <span className="ann-flag">
        <Icon name="bell" small />
        Важливе
      </span>
      <h3 className="ann-title">{a.title}</h3>
      {a.date ? (
        <span className="ann-when">
          {a.startMin !== null && (
            <span className="t">{fmtTime(a.startMin)}</span>
          )}
          <span className="d">
            <b>{when}</b>
            {a.place && <span>{a.place}</span>}
          </span>
        </span>
      ) : (
        a.excerpt && <span className="ann-excerpt">{a.excerpt}</span>
      )}
    </Link>
  );
}

/** A row in the feed: a calendar leaf for events, a thumbnail when there is a picture. */
export function AnnouncementRow({
  a,
  sub,
  to = `/announcements/${a.id}`,
}: {
  a: Item;
  /** What the second line says for undated news, e.g. «вчора». */
  sub?: string;
  /** Where the row leads; «Праця» opens its own page. */
  to?: string;
}) {
  return (
    <Link viewTransition className="glass ann-row" to={to}>
      {a.date ? <CalendarLeaf date={a.date} /> : null}
      <span className="ann-row-text">
        <b>{a.title}</b>
        {!a.date && a.excerpt && (
          <span className="ann-excerpt">{a.excerpt}</span>
        )}
        <span className="meta">
          {a.startMin !== null && (
            <span>
              <Icon name="clock" small />
              {fmtTime(a.startMin)}
            </span>
          )}
          {a.place && (
            <span>
              <Icon name="pin" small />
              {a.place}
            </span>
          )}
          {!a.date && sub && <span>{sub}</span>}
          {a.imageCount > 1 && (
            <span>
              <Icon name="image" small />
              {a.imageCount}
            </span>
          )}
          <StatusPill status={a.status} />
        </span>
      </span>
      {a.cover && (
        <img
          className="ann-thumb"
          src={mediaUrl(a.cover)}
          alt=""
          loading="lazy"
          decoding="async"
        />
      )}
    </Link>
  );
}

/**
 * An announcement's page body, the same on the public page and in «Праця»:
 * pictures, the text, sharing once published, the reason if turned down.
 */
export function AnnouncementView({
  a,
  today,
}: {
  a: AnnouncementPage["a"];
  today: string;
}) {
  const when = whenLabel(a.date, null, today);
  return (
    <>
      <Gallery images={a.images} />

      <article className="glass ann-detail">
        <div className="ann-detail-top">
          {a.important && (
            <span className="ann-flag">
              <Icon name="bell" small />
              Важливе
            </span>
          )}
          <StatusPill status={a.status} />
        </div>
        <h2>{a.title}</h2>
        {(a.date || a.place) && (
          <div className="ann-when">
            {a.startMin !== null && (
              <span className="t">{fmtTime(a.startMin)}</span>
            )}
            <span className="d">
              {when && <b>{when}</b>}
              {a.place && <span>{a.place}</span>}
            </span>
          </div>
        )}
        {a.bodyHtml && (
          <div
            className="ann-body rich"
            // Rendered on the server from Markdown; people's HTML stays text.
            dangerouslySetInnerHTML={{ __html: a.bodyHtml }}
          />
        )}
        <p className="ann-by">
          {a.status === "published"
            ? `Опубліковано ${a.published}`
            : a.status === "pending"
              ? "Пропозиція чекає рішення студради"
              : "Не опубліковано"}
          {" · автор: "}
          {a.author}
        </p>
      </article>

      {a.status === "published" && (
        <ShareButton title={a.title} path={`/announcements/${a.id}`} />
      )}

      {a.status === "rejected" && a.rejectReason && (
        <div className="glass reason">
          <b>Чому не опубліковано</b>
          <p>{a.rejectReason}</p>
          {a.decidedByName && <small>Рішення: {a.decidedByName}</small>}
        </div>
      )}
    </>
  );
}
