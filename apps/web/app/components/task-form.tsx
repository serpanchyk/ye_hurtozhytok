import { Form, useNavigation } from "react-router";

import { Check } from "~/components/controls";
import {
  DETAILS_MAX,
  PLACE_MAX,
  TITLE_MAX,
  type TaskErrors,
} from "~/lib/tasks";

type Initial = {
  title: string;
  details: string | null;
  place: string | null;
  public: boolean;
};

function Hint({
  id,
  error,
  hint,
}: {
  id: string;
  error?: string;
  hint?: string;
}) {
  if (error)
    return (
      <small className="field-error" id={`${id}-error`}>
        {error}
      </small>
    );
  return hint ? <small>{hint}</small> : null;
}

/** A card: what to do, where, details for those who keep the board, visibility. */
export function TaskForm({
  initial,
  errors,
  submitLabel,
}: {
  initial: Initial;
  errors?: TaskErrors;
  submitLabel: string;
}) {
  const busy = useNavigation().state === "submitting";
  return (
    <Form method="post" className="glass form">
      <div className="field-row">
        <label htmlFor="title">Що зробити</label>
        <input
          id="title"
          name="title"
          defaultValue={initial.title}
          maxLength={TITLE_MAX}
          required
          placeholder="Замінити лампу в коридорі"
          aria-invalid={errors?.title ? true : undefined}
          aria-describedby={errors?.title ? "title-error" : undefined}
        />
        <Hint id="title" error={errors?.title} />
      </div>
      <div className="field-row">
        <label htmlFor="place">
          Де <span className="opt">необовʼязково</span>
        </label>
        <input
          id="place"
          name="place"
          defaultValue={initial.place ?? ""}
          maxLength={PLACE_MAX}
          placeholder="3 поверх"
          aria-invalid={errors?.place ? true : undefined}
          aria-describedby={errors?.place ? "place-error" : undefined}
        />
        <Hint id="place" error={errors?.place} />
      </div>
      <div className="field-row">
        <label htmlFor="details">
          Подробиці <span className="opt">необовʼязково</span>
        </label>
        <textarea
          id="details"
          name="details"
          className="area"
          rows={4}
          defaultValue={initial.details ?? ""}
          maxLength={DETAILS_MAX}
          aria-invalid={errors?.details ? true : undefined}
          aria-describedby={errors?.details ? "details-error" : "details-hint"}
        />
        {errors?.details ? (
          <Hint id="details" error={errors.details} />
        ) : (
          <small id="details-hint">Бачать лише ті, хто веде дошку.</small>
        )}
      </div>
      <Check
        name="public"
        defaultChecked={initial.public}
        title="Публічна"
        hint="Назву, місце й статус побачать усі мешканці. Подробиці й виконавців — лише ви."
      />
      <button className="btn btn-primary block" type="submit" disabled={busy}>
        {submitLabel}
      </button>
    </Form>
  );
}
