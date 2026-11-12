import { useEffect, useRef, useState } from "react";
import { Form, data, redirect, useNavigation } from "react-router";

import { ChoiceChips, FormField } from "~/components/controls";
import { PillGroup } from "~/components/pill-group";
import { Credit, TopBar } from "~/components/ui";
import { requireProfile } from "~/lib/auth.server";
import {
  BODY_MAX,
  PLACE_MAX,
  RECIPIENTS,
  TOPICS_FOR,
  TOPIC_LABELS,
  type Recipient,
} from "~/lib/complaints";
import { createComplaint } from "~/lib/complaints.server";
import { canWriteComplaint } from "~/lib/permissions";
import type { Route } from "./+types/complaint-new";

export const handle = { tab: "services" };
export const meta: Route.MetaFunction = () => [
  { title: "Нове звернення · єГуртожиток" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const me = await requireProfile(request, context.cloudflare.env);
  if (!canWriteComplaint(me))
    throw new Response("Ваш акаунт заблоковано.", { status: 403 });
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const { env, ctx } = context.cloudflare;
  const me = await requireProfile(request, env);
  const form = await request.formData();
  const result = await createComplaint(env, ctx, me, form);
  // What was typed comes back, so a page without JavaScript keeps it too.
  const typed = (name: string) => String(form.get(name) ?? "");
  if (!result.ok)
    return data(
      {
        errors: result.errors,
        values: {
          to: typed("to"),
          topic: typed("topic"),
          place: typed("place"),
          body: typed("body"),
        },
      },
      { status: 400 },
    );
  throw redirect(`/complaints/${result.id}?sent=1`);
}

/**
 * First «Кому», then only that recipient's topics, «Інше» always among them.
 * Without JavaScript every group shows; the server checks the topic belongs
 * to the chosen recipient.
 */
export default function NewComplaint({ actionData }: Route.ComponentProps) {
  const errors = actionData?.errors;
  const typed = actionData?.values;
  const busy = useNavigation().state === "submitting";
  const [to, setTo] = useState<Recipient>(
    RECIPIENTS.find((r) => r.id === typed?.to)?.id ?? "council",
  );
  // The gliding pill takes over once the page is live; before that the
  // checked radio highlights itself.
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);
  const form = useRef<HTMLFormElement>(null);
  const choose = (next: Recipient) => {
    setTo(next);
    // A topic picked under another recipient is dropped with it.
    form.current
      ?.querySelectorAll<HTMLInputElement>(
        `[data-to]:not([data-to="${next}"]) input`,
      )
      .forEach((i) => (i.checked = false));
  };
  return (
    <>
      <TopBar back="/complaints" title="Нове звернення" />
      <Form method="post" className="glass form" ref={form}>
        <fieldset className="choice">
          <legend>Кому</legend>
          <PillGroup as="div" className="seg" label="Кому">
            {RECIPIENTS.map((r) => (
              <label
                data-pill-item
                key={r.id}
                aria-current={live && to === r.id ? "true" : undefined}
              >
                <input
                  className="control-input"
                  type="radio"
                  name="to"
                  value={r.id}
                  defaultChecked={r.id === to}
                  onChange={() => choose(r.id)}
                />
                {r.label}
              </label>
            ))}
          </PillGroup>
          {/* Every hint is there; CSS shows the chosen one, with or without JavaScript. */}
          {RECIPIENTS.map((r) => (
            <small className="choice-hint" data-to={r.id} key={r.id}>
              {r.hint}
            </small>
          ))}
        </fieldset>

        {RECIPIENTS.map((r) => (
          <div className="topic-group" data-to={r.id} key={r.id}>
            <ChoiceChips
              name="topic"
              legend="Що сталося"
              columns={2}
              defaultValue={typed?.topic}
              options={TOPICS_FOR[r.id].map((t) => ({
                value: t,
                label: TOPIC_LABELS[t],
              }))}
            />
          </div>
        ))}
        {errors?.topic && <small className="field-error">{errors.topic}</small>}

        {/* A place means nothing for the app, so it hides there. */}
        <div className="place-field">
          <FormField id="place" label="Де" optional error={errors?.place}>
            <input
              id="place"
              name="place"
              maxLength={PLACE_MAX}
              defaultValue={typed?.place}
              placeholder="5 поверх, кухня"
            />
          </FormField>
        </div>
        <FormField id="body" label="Опишіть" error={errors?.body}>
          <textarea
            id="body"
            name="body"
            className="area"
            rows={5}
            maxLength={BODY_MAX}
            defaultValue={typed?.body}
            required
            aria-describedby={errors?.body ? "body-error" : undefined}
          />
        </FormField>
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
          Ті, кому ви пишете, побачать ваше імʼя, кімнату й Telegram, щоб
          уточнити деталі. На дошці всі побачать лише тему, місце й стан, без
          вашого імені й тексту.
        </p>
        <button className="btn btn-primary block" type="submit" disabled={busy}>
          Надіслати
        </button>
      </Form>
      <Credit />
    </>
  );
}
