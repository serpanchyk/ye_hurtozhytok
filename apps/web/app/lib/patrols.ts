import { readDate } from "./date-fields";
import type { PatrolStatus } from "./db/schema";

export const NOTES_MAX = 2000;
const TASK_TITLE_MAX = 80;

export type PatrolValues = {
  date: string;
  status: PatrolStatus;
  notes: string | null;
  people: number[];
};
export type PatrolErrors = Partial<Record<"date" | "people" | "notes", string>>;

/** A patrol: done or planned, its day, who went (from `allowed`) and notes. */
export function parsePatrolForm(
  form: FormData,
  allowed: readonly number[],
): { ok: true; values: PatrolValues } | { ok: false; errors: PatrolErrors } {
  const errors: PatrolErrors = {};
  const date = readDate(form, "date");
  if (date.error !== undefined) errors.date = date.error;
  else if (!date.value) errors.date = "Оберіть день.";
  const status: PatrolStatus =
    form.get("status") === "planned" ? "planned" : "done";
  const people = [...new Set(form.getAll("people").map(Number))].filter((id) =>
    allowed.includes(id),
  );
  if (people.length === 0)
    errors.people =
      status === "done" ? "Відмітьте, хто ходив." : "Відмітьте, хто піде.";
  const notes = String(form.get("notes") ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (notes.length > NOTES_MAX) errors.notes = `До ${NOTES_MAX} символів.`;
  if (Object.keys(errors).length || !date.value) return { ok: false, errors };
  return {
    ok: true,
    values: { date: date.value, status, notes: notes || null, people },
  };
}

/** The first line of the notes, short enough for a card's title. */
export function taskTitleFromNotes(notes: string): string {
  const line = notes.trim().split("\n")[0].trim();
  return line.length > TASK_TITLE_MAX
    ? `${line.slice(0, TASK_TITLE_MAX - 1)}…`
    : line;
}
