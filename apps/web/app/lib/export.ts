/** Plain-Ukrainian wording for the squad's Excel file. */
import { fmtMin } from "./booking";
import type { PatrolStatus } from "./db/schema";
import { BOARD_LABELS, STATUS_LABELS } from "./tasks";
import { kyivDateKey, kyivMinute } from "./time";
import type { DateCell } from "./xlsx";

export const PATROL_STATUS_TEXT: Record<PatrolStatus, string> = {
  done: "Був",
  planned: "Плануємо",
};

export const ENTITY_TEXT: Record<string, string> = {
  task: "Картка",
  shift: "Вахта",
  patrol: "Обхід",
};

export const ACTION_TEXT: Record<string, string> = {
  "task.created": "Додано картку",
  "task.updated": "Змінено картку",
  "task.status": "Змінено стан",
  "task.taken": "Взято в роботу",
  "task.left": "Вихід з виконавців",
  "task.assigned": "Призначено виконавців",
  "task.moved": "Передано на іншу дошку",
  "task.deleted": "Видалено картку",
  "shift.created": "Додано вахту",
  "shift.edited": "Змінено вахту",
  "shift.signed": "Запис на вахту",
  "shift.left": "Звільнено вахту",
  "shift.deleted": "Видалено вахту",
  "patrol.recorded": "Записано обхід",
  "patrol.planned": "Заплановано обхід",
  "patrol.edited": "Змінено обхід",
  "patrol.deleted": "Видалено обхід",
};

const KEY_TEXT: Record<string, string> = {
  date: "дата",
  residentId: "на вахті",
  note: "примітка",
  status: "стан",
  title: "назва",
  people: "учасники",
  notes: "нотатка",
  board: "дошка",
  public: "публічна",
  before: "було",
  after: "стало",
  from: "з",
  to: "до",
  complaint: "зі звернення",
  patrol: "з обходу",
  assignees: "виконавці",
  added: "додано",
  removed: "прибрано",
};

const BOARD_KEYS = new Set(["board", "from", "to"]);
const PEOPLE_KEYS = new Set(["people", "assignees", "added", "removed"]);

export function dateCell(dateKey: string | null): DateCell | null {
  return dateKey ? { date: dateKey } : null;
}

/** A UTC moment as a Kyiv date and time cell. */
export function momentCell(ms: number | null): DateCell | null {
  return ms === null
    ? null
    : { date: kyivDateKey(ms), time: fmtMin(kyivMinute(ms)) };
}

/** "22.10.2026" */
export function dayText(dateKey: string): string {
  const [y, m, d] = dateKey.split("-");
  return `${d}.${m}.${y}`;
}

type Context = { names: Map<number, string>; entity: string };

function valueText(key: string, value: unknown, ctx: Context): string {
  if (value === null || value === undefined || value === "")
    return key === "residentId" ? "вільна" : "—";
  if (key === "residentId" && typeof value === "number")
    return ctx.names.get(value) ?? `№${value}`;
  if (PEOPLE_KEYS.has(key) && Array.isArray(value))
    return value.map((id) => ctx.names.get(Number(id)) ?? `№${id}`).join(", ");
  if (typeof value === "string") {
    if (key === "date") return dayText(value);
    // A patrol's «done» is «Був», a card's is «Готово»; «з»/«до» are boards or states.
    const states: Record<string, string> =
      ctx.entity === "patrol" ? PATROL_STATUS_TEXT : STATUS_LABELS;
    const boards: Record<string, string> = BOARD_LABELS;
    if (BOARD_KEYS.has(key) && boards[value]) return boards[value];
    if ((key === "status" || BOARD_KEYS.has(key)) && states[value])
      return states[value];
  }
  if (typeof value === "boolean") return value ? "так" : "ні";
  if (typeof value === "object")
    return describeObject(value as Record<string, unknown>, ctx);
  return String(value);
}

function describeObject(value: Record<string, unknown>, ctx: Context): string {
  return Object.entries(value)
    .map(([k, v]) => `${KEY_TEXT[k] ?? k}: ${valueText(k, v, ctx)}`)
    .join("; ");
}

/** The log entry's details as «дата: 22.10.2026; на вахті: Антон». */
export function describeDetails(
  details: string | null,
  names: Map<number, string>,
  entity = "",
): string {
  if (!details) return "";
  try {
    const parsed: unknown = JSON.parse(details);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? describeObject(parsed as Record<string, unknown>, { names, entity })
      : details;
  } catch {
    return details;
  }
}

/** "zahin-2026-11-11.xlsx" */
export function exportFileName(today: string): string {
  return `zahin-${today}.xlsx`;
}
