import { Form, useNavigation } from "react-router";

import {
  Check,
  ChoiceChips,
  DateField,
  FormField,
} from "~/components/controls";
import { NOTES_MAX, type PatrolErrors } from "~/lib/patrols";

/**
 * A patrol: already done or planned, its day (past days too), who went,
 * what was noticed and, after a patrol, a card made from the notes.
 */
export function PatrolForm({
  today,
  initial,
  people,
  withCard,
  errors,
  submitLabel,
}: {
  today: string;
  initial: {
    date: string;
    status: "done" | "planned";
    notes: string | null;
    people: number[];
  };
  people: { id: number; name: string }[];
  /** Offer «Створити картку з нотатки» (only for a new patrol). */
  withCard: boolean;
  errors?: PatrolErrors;
  submitLabel: string;
}) {
  const busy = useNavigation().state === "submitting";
  return (
    <Form method="post" className="glass form">
      <ChoiceChips
        name="status"
        legend="Обхід"
        columns={2}
        defaultValue={initial.status}
        options={[
          { value: "done", label: "Уже був" },
          { value: "planned", label: "Плануємо" },
        ]}
      />
      <DateField
        name="date"
        legend="День"
        today={today}
        back={14}
        defaultValue={initial.date}
        allowNone={false}
        error={errors?.date}
      />
      <fieldset className="choice">
        <legend>Хто</legend>
        {people.map((p) => (
          <Check
            key={p.id}
            name="people"
            value={String(p.id)}
            defaultChecked={initial.people.includes(p.id)}
            title={p.name}
          />
        ))}
        {errors?.people && (
          <small className="field-error">{errors.people}</small>
        )}
      </fieldset>
      <FormField id="notes" label="Що помітили" optional error={errors?.notes}>
        <textarea
          id="notes"
          name="notes"
          className="area"
          rows={4}
          maxLength={NOTES_MAX}
          defaultValue={initial.notes ?? ""}
        />
      </FormField>
      {withCard && (
        <Check
          name="card"
          title="Створити картку з нотатки"
          hint="Приватна картка на робочій дошці загону, якщо обхід уже був."
        />
      )}
      <button className="btn btn-primary block" type="submit" disabled={busy}>
        {submitLabel}
      </button>
    </Form>
  );
}
