import { readDate } from "./date-fields";
import { addDays, weekdayIndex } from "./time";

/** Friday and Saturday (Monday = 0) have no duty shifts. */
export const NO_DUTY_WEEKDAYS: readonly number[] = [4, 5];
export const NO_DUTY_MESSAGE = "У пʼятницю й суботу вахт немає.";
export const NOTE_MAX = 200;

export function hasDuty(dateKey: string): boolean {
  return !NO_DUTY_WEEKDAYS.includes(weekdayIndex(dateKey));
}

/** The given day if it has duty, otherwise the next one that does. */
export function nextDutyDate(dateKey: string): string {
  let day = dateKey;
  while (!hasDuty(day)) day = addDays(day, 1);
  return day;
}

export type ShiftValues = {
  date: string;
  residentId: number | null;
  note: string | null;
};
export type ShiftErrors = Partial<Record<"date" | "who" | "note", string>>;

/**
 * Who stands the shift: «me», «free», or a person's id (only those who lead
 * the squad pick others; `allowed` is who may stand at all; `keep` is who is
 * on it already, whom anyone editing may leave there).
 */
export function parseShiftForm(
  form: FormData,
  ctx: {
    me: number;
    leads: boolean;
    allowed: readonly number[];
    keep?: number | null;
    /** Days before it are history: only those who lead write them. */
    today: string;
  },
): { ok: true; values: ShiftValues } | { ok: false; errors: ShiftErrors } {
  const errors: ShiftErrors = {};
  const date = readDate(form, "date");
  if (date.error !== undefined) errors.date = date.error;
  else if (!date.value) errors.date = "Оберіть день.";
  else if (!hasDuty(date.value)) errors.date = NO_DUTY_MESSAGE;
  else if (!ctx.leads && date.value < ctx.today)
    errors.date = "Минулий день записує лише голова загону.";

  const who = String(form.get("who") ?? "free");
  let residentId: number | null = null;
  if (who === "me") residentId = ctx.me;
  else if (who !== "free") {
    const id = Number(who);
    if (id === ctx.keep) residentId = id;
    else if (!ctx.leads) errors.who = "Записати іншого може голова загону.";
    else if (!ctx.allowed.includes(id)) errors.who = "Ця людина не в загоні.";
    else residentId = id;
  }
  if (
    residentId !== null &&
    residentId !== ctx.keep &&
    !ctx.allowed.includes(residentId)
  )
    errors.who ??= "На вахті стоять лише ті, хто в загоні.";

  const note = String(form.get("note") ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (note.length > NOTE_MAX) errors.note = `До ${NOTE_MAX} символів.`;

  if (Object.keys(errors).length || !date.value) return { ok: false, errors };
  return {
    ok: true,
    values: { date: date.value, residentId, note: note || null },
  };
}

export type ShiftStat = {
  id: number;
  name: string;
  /** Shifts already sat (the day is over). */
  total: number;
  /** Of those, how many this month. */
  month: number;
};

/**
 * «Хто скільки відсидів»: most shifts first, then most this month, then by
 * name. Equal totals share a place (1, 1, 3), so nobody is ranked by the
 * alphabet.
 */
export function rankShiftStats<T extends ShiftStat>(
  rows: readonly T[],
): (T & { place: number })[] {
  const sorted = [...rows].sort(
    (a, b) =>
      b.total - a.total ||
      b.month - a.month ||
      a.name.localeCompare(b.name, "uk"),
  );
  let place = 0;
  return sorted.map((row, i) => {
    const prev = sorted[i - 1];
    if (!prev || prev.total !== row.total || prev.month !== row.month)
      place = i + 1;
    return { ...row, place };
  });
}
