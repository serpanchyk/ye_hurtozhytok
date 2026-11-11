import {
  COMPLAINT_TOPICS,
  type Board,
  type ComplaintTopic,
  type TaskStatus,
} from "./db/schema";

export { COMPLAINT_TOPICS, type ComplaintTopic };

export const BODY_MAX = 1500;
export const PLACE_MAX = 80;
export const REPLY_MAX = 500;
/** Complaints one person may have open at once. */
export const MAX_OPEN = 5;

/** Who a complaint goes to; the form asks this first. */
export const RECIPIENTS = [
  { id: "council", label: "Студрада", hint: "Поломки, чистота, побут" },
  { id: "squad", label: "Оперзагін", hint: "Шум, сторонні, безпека" },
  { id: "app", label: "Застосунок", hint: "Щось не так у єГуртожитку" },
] as const;
export type Recipient = (typeof RECIPIENTS)[number]["id"];

export const TOPIC_LABELS: Record<ComplaintTopic, string> = {
  electricity: "Електрика",
  plumbing: "Сантехніка",
  furniture: "Меблі й вікна",
  laundry: "Пралки",
  cleaning: "Чистота",
  council_other: "Інше",
  noise: "Шум",
  strangers: "Сторонні",
  safety: "Безпека",
  rules: "Порушення правил",
  squad_other: "Інше",
  app_bug: "Щось не працює",
  app_idea: "Ідея",
  app_other: "Інше",
};

/** The topics of each recipient, «Інше» always last. */
export const TOPICS_FOR: Record<Recipient, readonly ComplaintTopic[]> = {
  council: [
    "electricity",
    "plumbing",
    "furniture",
    "laundry",
    "cleaning",
    "council_other",
  ],
  squad: ["noise", "strangers", "safety", "rules", "squad_other"],
  app: ["app_bug", "app_idea", "app_other"],
};

export const APP_TOPICS = TOPICS_FOR.app;

export function recipientOf(topic: ComplaintTopic): Recipient {
  return (Object.keys(TOPICS_FOR) as Recipient[]).find((r) =>
    TOPICS_FOR[r].includes(topic),
  )!;
}

/** Who gets it: the council's board, the squad's board, or (null) the site manager. */
export function boardFor(topic: ComplaintTopic): Board | null {
  const to = recipientOf(topic);
  return to === "app" ? null : to;
}

export function isTopic(value: unknown): value is ComplaintTopic {
  return (
    typeof value === "string" &&
    (COMPLAINT_TOPICS as readonly string[]).includes(value)
  );
}

export type ComplaintStatus = "sent" | "in_progress" | "resolved" | "rejected";

export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  sent: "Надіслано",
  in_progress: "В роботі",
  resolved: "Вирішено",
  rejected: "Відхилено",
};

/** Status pill tones, the same pills as cards and announcements. */
export const COMPLAINT_STATUS_TONE: Record<ComplaintStatus, string> = {
  sent: "new",
  in_progress: "work",
  resolved: "done",
  rejected: "no",
};

/**
 * A complaint's state is never stored on its own: it is its card's column
 * («Нові», «В роботі», «Готово»), or turned down, or — for one about the app,
 * which has no card — closed by the site manager.
 */
export function complaintStatus(c: {
  rejectedAt: number | null;
  resolvedAt: number | null;
  taskStatus: TaskStatus | null;
}): ComplaintStatus {
  if (c.rejectedAt !== null) return "rejected";
  if (c.taskStatus === "done" || c.resolvedAt !== null) return "resolved";
  if (c.taskStatus === "in_progress") return "in_progress";
  return "sent";
}

export function isOpen(status: ComplaintStatus): boolean {
  return status === "sent" || status === "in_progress";
}

/** The card's name: topic and place, never the author's own words. */
export function cardTitle(topic: ComplaintTopic, place: string | null) {
  return place ? `${TOPIC_LABELS[topic]} · ${place}` : TOPIC_LABELS[topic];
}

export type ComplaintValues = {
  topic: ComplaintTopic;
  body: string;
  place: string | null;
};
export type ComplaintErrors = Partial<
  Record<"topic" | "body" | "place", string>
>;

function text(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : "";
}

export function parseComplaintForm(
  form: FormData,
):
  | { ok: true; values: ComplaintValues }
  | { ok: false; errors: ComplaintErrors } {
  const errors: ComplaintErrors = {};
  const topic = form.get("topic");
  const body = text(form, "body");
  const place = text(form, "place").replace(/\s+/g, " ");
  const to = form.get("to");
  if (!isTopic(topic) || (to !== null && to !== recipientOf(topic)))
    errors.topic = "Оберіть, що сталося.";
  if (body.length < 5) errors.body = "Опишіть, що сталося.";
  else if (body.length > BODY_MAX) errors.body = `До ${BODY_MAX} символів.`;
  if (place.length > PLACE_MAX)
    errors.place = `Місце до ${PLACE_MAX} символів.`;
  if (!isTopic(topic) || Object.keys(errors).length)
    return { ok: false, errors };
  // The app has no place; a value left in the hidden field is dropped.
  const where = boardFor(topic) ? place || null : null;
  return { ok: true, values: { topic, body, place: where } };
}

/** What the author is told; required to turn a complaint down. */
export function readReply(form: FormData): string {
  return text(form, "reply").slice(0, REPLY_MAX);
}
