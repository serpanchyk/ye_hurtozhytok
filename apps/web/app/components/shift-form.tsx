import { Form, useNavigation } from "react-router";

import { ChoiceChips, DateField, FormField } from "~/components/controls";
import { NOTE_MAX, type ShiftErrors } from "~/lib/shifts";

/**
 * A shift: the day (no «Без дати»), who stands it — me, nobody yet, or for
 * those who lead the squad anyone in it — and a note.
 */
export function ShiftForm({
  today,
  date,
  who,
  note,
  people,
  canSelf,
  errors,
  submitLabel,
}: {
  today: string;
  date: string;
  /** "me", "free" or a person's id. */
  who: string;
  note: string | null;
  /** Everyone who may be picked; empty for those who only sign themselves. */
  people: { id: number; name: string }[];
  canSelf: boolean;
  errors?: ShiftErrors;
  submitLabel: string;
}) {
  const busy = useNavigation().state === "submitting";
  return (
    <Form method="post" className="glass form">
      <DateField
        name="date"
        legend="День"
        today={today}
        defaultValue={date}
        allowNone={false}
        error={errors?.date}
      />
      <ChoiceChips
        name="who"
        legend="Хто на вахті"
        columns={2}
        defaultValue={who}
        options={[
          ...(canSelf ? [{ value: "me", label: "Я" }] : []),
          { value: "free", label: "Поки вільна" },
          ...people.map((p) => ({ value: String(p.id), label: p.name })),
        ]}
      />
      {errors?.who && <small className="field-error">{errors.who}</small>}
      <FormField id="note" label="Примітка" optional error={errors?.note}>
        <input
          id="note"
          name="note"
          maxLength={NOTE_MAX}
          defaultValue={note ?? ""}
          placeholder="Наприклад: до 23:00"
        />
      </FormField>
      <button className="btn btn-primary block" type="submit" disabled={busy}>
        {submitLabel}
      </button>
    </Form>
  );
}
