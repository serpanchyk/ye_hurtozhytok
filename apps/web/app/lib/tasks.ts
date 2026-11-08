import {
  BOARDS,
  TASK_STATUSES,
  type Board,
  type TaskStatus,
} from "./db/schema";

export { BOARDS, TASK_STATUSES, type Board, type TaskStatus };

export const TITLE_MAX = 140;
export const DETAILS_MAX = 2000;
export const PLACE_MAX = 80;
/** Finished cards shown on the board; older ones stay reachable by link. */
export const DONE_LIMIT = 30;

export const BOARD_LABELS: Record<Board, string> = {
  council: "Студрада",
  squad: "Оперзагін",
};

/** «Передати студраді» / «Передати загону». */
export const BOARD_DATIVE: Record<Board, string> = {
  council: "студраді",
  squad: "загону",
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  new: "Нові",
  in_progress: "В роботі",
  done: "Готово",
};

export function isBoard(value: unknown): value is Board {
  return (
    typeof value === "string" && (BOARDS as readonly string[]).includes(value)
  );
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return (
    typeof value === "string" &&
    (TASK_STATUSES as readonly string[]).includes(value)
  );
}

export function otherBoard(board: Board): Board {
  return board === "council" ? "squad" : "council";
}

/** The council works in the open; the squad's cards start private. */
export function defaultPublic(board: Board): boolean {
  return board === "council";
}

export type TaskFilter = "all" | "mine" | "free";

export function readFilter(value: unknown): TaskFilter {
  return value === "mine" || value === "free" ? value : "all";
}

export type TaskValues = {
  title: string;
  details: string | null;
  place: string | null;
  public: boolean;
};

export type TaskErrors = Partial<Record<"title" | "details" | "place", string>>;

function text(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : "";
}

export function parseTaskForm(
  form: FormData,
): { ok: true; values: TaskValues } | { ok: false; errors: TaskErrors } {
  const errors: TaskErrors = {};
  const title = text(form, "title").replace(/\s+/g, " ");
  const details = text(form, "details");
  const place = text(form, "place").replace(/\s+/g, " ");
  if (title.length < 3) errors.title = "Напишіть, що треба зробити.";
  else if (title.length > TITLE_MAX)
    errors.title = `Назва до ${TITLE_MAX} символів; подробиці — нижче.`;
  if (details.length > DETAILS_MAX)
    errors.details = `Подробиці до ${DETAILS_MAX} символів.`;
  if (place.length > PLACE_MAX)
    errors.place = `Місце до ${PLACE_MAX} символів.`;
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    values: {
      title,
      details: details || null,
      place: place || null,
      public: form.get("public") === "on",
    },
  };
}

type BoardCard = {
  status: TaskStatus;
  assigneeIds: readonly number[];
};

/** Cards by column, after the «усі / мої / нічиї» filter. */
export function columns<T extends BoardCard>(
  cards: readonly T[],
  filter: TaskFilter,
  me: number,
): Record<TaskStatus, T[]> {
  const result: Record<TaskStatus, T[]> = {
    new: [],
    in_progress: [],
    done: [],
  };
  for (const c of cards) {
    if (filter === "mine" && !c.assigneeIds.includes(me)) continue;
    if (filter === "free" && c.assigneeIds.length > 0) continue;
    result[c.status].push(c);
  }
  return result;
}

/** One line of a card's history, from its activity log entry. */
export function historyLabel(action: string, details: string | null): string {
  let d: Record<string, unknown> = {};
  try {
    d = details ? JSON.parse(details) : {};
  } catch {
    // Older or hand-written entries keep their plain text out of the label.
  }
  switch (action) {
    case "task.created":
      return "створює картку";
    case "task.updated":
      return d.public === true
        ? "змінює картку, тепер вона публічна"
        : d.public === false
          ? "змінює картку, тепер вона приватна"
          : "змінює картку";
    case "task.status":
      return isTaskStatus(d.status)
        ? `переносить у «${STATUS_LABELS[d.status]}»`
        : "змінює статус";
    case "task.taken":
      return "береться виконувати";
    case "task.left":
      return "більше не виконує";
    case "task.moved":
      return isBoard(d.from) && isBoard(d.to)
        ? `передає з дошки «${BOARD_LABELS[d.from]}» ${BOARD_DATIVE[d.to]}`
        : "передає на іншу дошку";
    case "task.deleted":
      return "видаляє картку";
    default:
      return "змінює картку";
  }
}
