/** Plain-Ukrainian wording for the squad's Excel file. */
import { fmtMin } from "./booking";
import type { PatrolStatus } from "./db/schema";
import { STATUS_LABELS } from "./tasks";
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
};

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

function valueText(
  key: string,
  value: unknown,
  names: Map<number, string>,
): string {
  if (value === null || value === undefined || value === "")
    return key === "residentId" ? "вільна" : "—";
  if (key === "residentId" && typeof value === "number")
    return names.get(value) ?? `№${value}`;
  if (key === "people" && Array.isArray(value))
    return value.map((id) => names.get(Number(id)) ?? `№${id}`).join(", ");
  if (key === "status" && typeof value === "string")
    return (
      (STATUS_LABELS as Record<string, string>)[value] ??
      (PATROL_STATUS_TEXT as Record<string, string>)[value] ??
      value
    );
  if (key === "date" && typeof value === "string") return dayText(value);
  if (typeof value === "boolean") return value ? "так" : "ні";
  if (typeof value === "object")
    return describeObject(value as Record<string, unknown>, names);
  return String(value);
}

function describeObject(
  value: Record<string, unknown>,
  names: Map<number, string>,
): string {
  return Object.entries(value)
    .map(([k, v]) => `${KEY_TEXT[k] ?? k}: ${valueText(k, v, names)}`)
    .join("; ");
}

/** The log entry's details as «дата: 22.10.2026; на вахті: Антон». */
export function describeDetails(
  details: string | null,
  names: Map<number, string>,
): string {
  if (!details) return "";
  try {
    const parsed: unknown = JSON.parse(details);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? describeObject(parsed as Record<string, unknown>, names)
      : details;
  } catch {
    return details;
  }
}

/** "zahin-2026-11-11.xlsx" */
export function exportFileName(today: string): string {
  return `zahin-${today}.xlsx`;
}
