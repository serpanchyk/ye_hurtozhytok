import { Form, useNavigation } from "react-router";

import { Check, FormField } from "~/components/controls";
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

const described = (id: string, error?: string, hint?: boolean) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

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
      <FormField id="title" label="Що зробити" error={errors?.title}>
        <input
          id="title"
          name="title"
          defaultValue={initial.title}
          maxLength={TITLE_MAX}
          required
          placeholder="Замінити лампу в коридорі"
          aria-invalid={errors?.title ? true : undefined}
          aria-describedby={described("title", errors?.title)}
        />
      </FormField>
      <FormField id="place" label="Де" optional error={errors?.place}>
        <input
          id="place"
          name="place"
          defaultValue={initial.place ?? ""}
          maxLength={PLACE_MAX}
          placeholder="3 поверх"
          aria-invalid={errors?.place ? true : undefined}
          aria-describedby={described("place", errors?.place)}
        />
      </FormField>
      <FormField
        id="details"
        label="Подробиці"
        optional
        error={errors?.details}
        hint="Бачать лише ті, хто веде дошку."
      >
        <textarea
          id="details"
          name="details"
          className="area"
          rows={4}
          defaultValue={initial.details ?? ""}
          maxLength={DETAILS_MAX}
          aria-invalid={errors?.details ? true : undefined}
          aria-describedby={described("details", errors?.details, true)}
        />
      </FormField>
      <Check
        name="public"
        defaultChecked={initial.public}
        title="Публічна"
        hint="Назву, місце, стан і виконавців побачать усі мешканці. Подробиці — лише ви."
      />
      <button className="btn btn-primary block" type="submit" disabled={busy}>
        {submitLabel}
      </button>
    </Form>
  );
}
