import type { TaskStatus } from "./db/schema";
import { hasDuty } from "./shifts";
import { WEEKDAYS_SHORT, addDays, startOfWeek, weekdayIndex } from "./time";

/**
 * What the bot posts to the squad's Telegram group (HTML parse mode), moved
 * over from Оперета. Pure: the server gathers the facts, these only word them.
 */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** «Імʼя (@нік)», so Telegram mentions the person. */
export function displayName(person: {
  name: string;
  telegram?: string | null;
}): string {
  return person.telegram ? `${person.name} (@${person.telegram})` : person.name;
}

function link(appUrl: string, path: string, label: string): string {
  return `<a href="${appUrl}${path}">${escapeHtml(label)}</a>`;
}

const DETAILS_LIMIT = 400;
function clip(text: string): string {
  return text.length > DETAILS_LIMIT
    ? `${text.slice(0, DETAILS_LIMIT - 1)}…`
    : text;
}

/** «Чт · 12.11» */
export function dayLabel(dateKey: string): string {
  return `${WEEKDAYS_SHORT[weekdayIndex(dateKey)]} · ${dateKey.slice(8, 10)}.${dateKey.slice(5, 7)}`;
}

const scheduleLink = (appUrl: string, date: string, label: string) =>
  link(appUrl, `/work/schedule?w=${startOfWeek(date)}`, label);
const cardLink = (appUrl: string, id: number) =>
  link(appUrl, `/work/tasks/${id}`, "Відкрити");

// ─── Cards on the squad's board ──────────────────────────────────────────

const STATUS_WORDS: Record<TaskStatus, string> = {
  new: "нова",
  in_progress: "в роботі",
  done: "готово",
};

export function newCardMessage(
  appUrl: string,
  card: {
    id: number;
    title: string;
    place: string | null;
    details: string | null;
    /** Null for a resident's complaint: their name stays in the app. */
    authorName: string | null;
    origin: "board" | "complaint" | "patrol" | "council";
  },
): string {
  const heading = {
    board: "Нова картка",
    complaint: "Нове звернення до загону",
    patrol: "Нова картка з обходу",
    council: "Студрада передала картку",
  }[card.origin];
  const lines = [`<b>${heading}</b>`, `<b>${escapeHtml(card.title)}</b>`];
  if (card.details && card.origin !== "patrol")
    lines.push(escapeHtml(clip(card.details)));
  if (card.place) lines.push(`Де: ${escapeHtml(card.place)}`);
  lines.push("Виконавця ще немає — можна взяти собі.");
  if (card.authorName)
    lines.push(
      `${card.origin === "council" ? "Передав(ла)" : "Додав(ла)"}: ${escapeHtml(card.authorName)}`,
    );
  lines.push(cardLink(appUrl, card.id));
  return lines.join("\n");
}

export function cardTakenMessage(
  appUrl: string,
  card: { id: number; title: string; takenBy: string; others: number },
): string {
  return [
    `<b>${card.others ? "Долучився(лася) до картки" : "Взято в роботу"}</b>`,
    escapeHtml(card.title),
    `${card.others ? "Долучився(лася)" : "Виконує"}: ${escapeHtml(card.takenBy)}`,
    cardLink(appUrl, card.id),
  ].join("\n");
}

export function cardStatusMessage(
  appUrl: string,
  card: {
    id: number;
    title: string;
    from: TaskStatus | null;
    to: TaskStatus;
    changedBy: string;
  },
): string {
  return [
    `<b>${card.to === "done" ? "Виконано" : "Змінено стан"}</b>`,
    escapeHtml(card.title),
    card.from
      ? `${STATUS_WORDS[card.from]} → <b>${STATUS_WORDS[card.to]}</b>`
      : `Тепер: <b>${STATUS_WORDS[card.to]}</b>`,
    `Змінив(ла): ${escapeHtml(card.changedBy)}`,
    cardLink(appUrl, card.id),
  ].join("\n");
}

export function cardToCouncilMessage(
  appUrl: string,
  card: { id: number; title: string; movedBy: string },
): string {
  return [
    "<b>Картку передано студраді</b>",
    escapeHtml(card.title),
    `Передав(ла): ${escapeHtml(card.movedBy)}`,
    cardLink(appUrl, card.id),
  ].join("\n");
}

// ─── Shifts ──────────────────────────────────────────────────────────────

export type ShiftInfo = { name: string | null; note: string | null };

function shiftLine(shift: ShiftInfo): string {
  const who = shift.name ? escapeHtml(shift.name) : "вільна";
  return shift.note ? `${who} — ${escapeHtml(shift.note)}` : who;
}

export type ShiftEvent =
  | {
      kind: "created";
      date: string;
      name: string | null;
      note: string | null;
      actorName: string;
    }
  | { kind: "signed"; date: string; name: string; note: string | null }
  | {
      kind: "freed";
      date: string;
      previousName: string;
      note: string | null;
      actorName: string;
    }
  | {
      kind: "edited";
      date: string;
      previousDate: string;
      name: string | null;
      /** Who was on the shift before (null: it was free). */
      previousName: string | null;
      note: string | null;
      actorName: string;
    }
  | {
      kind: "deleted";
      date: string;
      name: string | null;
      note: string | null;
      actorName: string;
    };

/** The same change as a ShiftEvent, with people as ids. */
export type ShiftChange =
  | { kind: "created" | "deleted"; date: string; who: number | null }
  | { kind: "signed" | "freed"; date: string }
  | {
      kind: "edited";
      date: string;
      previousDate: string;
      who: number | null;
      previousWho: number | null;
    };

/**
 * Changes to who is on duty (someone put on, taken off, replaced, a shift with
 * a person moved or cancelled) are always posted, so nobody finds out about
 * their shift too late. Smaller ones (a note, a new free shift) only for today
 * and tomorrow; later days reach the group in the Sunday schedule and the
 * morning summary.
 */
export function worthPosting(change: ShiftChange, today: string): boolean {
  const soon = (d: string) => d === today || d === addDays(today, 1);
  if (soon(change.date)) return true;
  switch (change.kind) {
    case "signed":
    case "freed":
      return true;
    case "created":
    case "deleted":
      return change.who !== null;
    case "edited":
      return (
        soon(change.previousDate) ||
        change.who !== change.previousWho ||
        (change.date !== change.previousDate &&
          (change.who ?? change.previousWho) !== null)
      );
  }
}

const SHIFT_TITLES: Record<ShiftEvent["kind"], string> = {
  created: "Нова вахта",
  signed: "Запис на вахту",
  freed: "Звільнилася вахта",
  edited: "Змінено вахту",
  deleted: "Скасовано вахту",
};

export function shiftEventMessage(appUrl: string, event: ShiftEvent): string {
  const lines = [
    `<b>${SHIFT_TITLES[event.kind]}</b> · ${dayLabel(event.date)}`,
  ];
  const signUp = scheduleLink(appUrl, event.date, "Розписатися");
  const open = scheduleLink(appUrl, event.date, "Графік");
  const freeText = "Вахта вільна — можна розписатися.";
  const note = () => {
    if (event.note) lines.push(`Примітка: ${escapeHtml(event.note)}`);
  };

  switch (event.kind) {
    case "created":
      lines.push(event.name ? `На вахті: ${escapeHtml(event.name)}` : freeText);
      note();
      lines.push(`Додав(ла): ${escapeHtml(event.actorName)}`);
      lines.push(event.name ? open : signUp);
      break;
    case "signed":
      lines.push(`На вахті: ${escapeHtml(event.name)}`);
      note();
      lines.push(open);
      break;
    case "freed":
      lines.push(
        event.previousName === event.actorName
          ? `${escapeHtml(event.previousName)} не зможе.`
          : `${escapeHtml(event.actorName)} зняв(ла) з вахти: ${escapeHtml(event.previousName)}.`,
      );
      note();
      lines.push(signUp);
      break;
    case "edited":
      if (event.previousDate !== event.date)
        lines.push(`Перенесено з ${dayLabel(event.previousDate)}`);
      // The person changed: name both, so both get a mention.
      if (event.previousName !== event.name)
        lines.push(
          `Було: ${escapeHtml(event.previousName ?? "вільна")} → стало: <b>${escapeHtml(event.name ?? "вільна")}</b>`,
        );
      else
        lines.push(
          event.name ? `На вахті: ${escapeHtml(event.name)}` : freeText,
        );
      note();
      lines.push(`Змінив(ла): ${escapeHtml(event.actorName)}`);
      lines.push(event.name ? open : signUp);
      break;
    case "deleted":
      lines.push(`Була: ${shiftLine(event)}`);
      lines.push(`Скасував(ла): ${escapeHtml(event.actorName)}`);
      lines.push(open);
      break;
  }
  return lines.join("\n");
}

/** A day as the summaries see it: one shift at most, or none yet. */
export type DayShift = { date: string; shift: ShiftInfo | null };

function dutyLine(day: DayShift): string {
  if (!hasDuty(day.date)) return "вахти немає";
  return day.shift ? shiftLine(day.shift) : "ще ніхто не записався";
}

/** A duty day that still needs someone: no shift yet, or a free one. */
function needsPeople(day: DayShift): boolean {
  return hasDuty(day.date) && !day.shift?.name;
}

function daysWord(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return "день";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100))
    return "дні";
  return "днів";
}

/** Sunday evening: the coming week, Friday and Saturday left out. */
export function weekScheduleMessage(appUrl: string, days: DayShift[]): string {
  const duty = days.filter((d) => hasDuty(d.date));
  const first = days[0].date;
  const last = days[days.length - 1].date;
  const lines = [
    `<b>Графік вахт · ${dayLabel(first).slice(5)}–${dayLabel(last).slice(5)}</b>`,
  ];
  for (const day of duty)
    lines.push(`<b>${dayLabel(day.date)}</b> — ${dutyLine(day)}`);
  const open = duty.filter(needsPeople).length;
  lines.push(
    open ? `Потрібні люди на ${open} ${daysWord(open)}.` : "Усі дні заповнені.",
  );
  lines.push(scheduleLink(appUrl, first, open ? "Розписатися" : "Графік"));
  return lines.join("\n");
}

// ─── Daily summaries ─────────────────────────────────────────────────────

export function morningMessage(
  appUrl: string,
  s: {
    today: DayShift;
    tomorrow: DayShift;
    /** Today's announcements, «20:00» or null for no time. */
    events: { title: string; time: string | null }[];
    openCards: number;
    newCards: number;
  },
): string {
  const lines = [`<b>Сьогодні · ${dayLabel(s.today.date)}</b>`];
  if (hasDuty(s.today.date)) lines.push(`<b>Вахта:</b> ${dutyLine(s.today)}`);
  for (const e of s.events)
    lines.push(
      `${e.time ? `О ${e.time}` : "Сьогодні"}: ${escapeHtml(e.title)}`,
    );
  if (hasDuty(s.tomorrow.date))
    lines.push(
      `<b>Завтра, ${dayLabel(s.tomorrow.date)}:</b> ${dutyLine(s.tomorrow)}`,
    );
  lines.push(
    `Відкритих карток: ${s.openCards}${s.newCards ? ` (нових: ${s.newCards})` : ""}`,
  );
  lines.push(scheduleLink(appUrl, s.today.date, "Графік"));
  return lines.join("\n");
}

/** Evening nudge; null when today's shift already has a person. */
export function freeShiftMessage(appUrl: string, day: DayShift): string | null {
  if (!needsPeople(day)) return null;
  return [
    `<b>Вахта · ${dayLabel(day.date)}</b>`,
    day.shift
      ? "На сьогодні лишилася вільна вахта."
      : "На сьогодні ще ніхто не записався на вахту.",
    scheduleLink(appUrl, day.date, "Розписатися"),
  ].join("\n");
}

// ─── Patrols ─────────────────────────────────────────────────────────────

export function patrolMessage(
  appUrl: string,
  patrol: {
    date: string;
    planned: boolean;
    edited: boolean;
    people: string[];
    notes: string | null;
    authorName: string;
  },
): string {
  const title = patrol.planned
    ? patrol.edited
      ? "Змінено план обходу"
      : "Заплановано обхід"
    : patrol.edited
      ? "Змінено запис обходу"
      : "Обхід";
  const lines = [`<b>${title}</b> · ${dayLabel(patrol.date)}`];
  lines.push(
    `${patrol.planned ? "Підуть" : "Ходили"}: ${escapeHtml(patrol.people.join(", ") || "—")}`,
  );
  if (patrol.notes) lines.push(escapeHtml(clip(patrol.notes)));
  else if (!patrol.planned) lines.push("Без зауважень.");
  lines.push(
    `${patrol.edited ? "Змінив(ла)" : patrol.planned ? "Запланував(ла)" : "Записав(ла)"}: ${escapeHtml(patrol.authorName)}`,
  );
  lines.push(scheduleLink(appUrl, patrol.date, "Графік"));
  return lines.join("\n");
}

/** Who has sat how many shifts; those with none are listed together at the end. */
export function shiftTopMessage(
  appUrl: string,
  rows: readonly {
    place: number;
    name: string;
    telegram: string | null;
    total: number;
    month: number;
  }[],
): string {
  const label = (r: { name: string; telegram: string | null }) =>
    escapeHtml(displayName(r));
  const done = rows.filter((r) => r.total > 0);
  const none = rows.filter((r) => r.total === 0);
  const lines = ["<b>Хто скільки відсидів вахт</b>"];
  if (done.length === 0) lines.push("Ще ніхто не відсидів жодної вахти.");
  for (const r of done)
    lines.push(
      `${r.place}. ${label(r)} — <b>${r.total}</b>${r.month ? ` (цього місяця: ${r.month})` : ""}`,
    );
  if (none.length) lines.push(`Ще не чергували: ${none.map(label).join(", ")}`);
  lines.push(link(appUrl, "/work/stats", "Уся статистика"));
  return lines.join("\n");
}

/** Between 23:00 and 08:00 Kyiv time messages arrive without sound. */
export function isQuietHour(kyivHour: number): boolean {
  return kyivHour >= 23 || kyivHour < 8;
}

/** The first line without markup, to show the last message in the app. */
export function summaryLine(text: string): string {
  return text
    .split("\n")[0]
    .replace(/<[^>]+>/g, "")
    .slice(0, 80);
}
