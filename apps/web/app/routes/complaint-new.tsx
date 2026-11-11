import { Form, data, redirect, useNavigation } from "react-router";

import { ChoiceChips, FormField } from "~/components/controls";
import { Credit, TopBar } from "~/components/ui";
import { requireProfile } from "~/lib/auth.server";
import {
  BODY_MAX,
  COMPLAINT_TOPICS,
  PLACE_MAX,
  TOPIC_BOARD,
  TOPIC_LABELS,
  type ComplaintTopic,
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
  const result = await createComplaint(env, ctx, me, await request.formData());
  if (!result.ok) return data({ errors: result.errors }, { status: 400 });
  throw redirect(`/complaints/${result.id}?sent=1`);
}

// One radio group in three parts, by who gets the complaint.
const GROUPS: { legend: string; topics: ComplaintTopic[] }[] = [
  {
    legend: "Побут — студрада",
    topics: COMPLAINT_TOPICS.filter((t) => TOPIC_BOARD[t] === "council"),
  },
  {
    legend: "Порядок — оперзагін",
    topics: COMPLAINT_TOPICS.filter((t) => TOPIC_BOARD[t] === "squad"),
  },
  {
    legend: "Застосунок — розпорядник",
    topics: COMPLAINT_TOPICS.filter((t) => TOPIC_BOARD[t] === null),
  },
];

export default function NewComplaint({ actionData }: Route.ComponentProps) {
  const errors = actionData?.errors;
  const busy = useNavigation().state === "submitting";
  return (
    <>
      <TopBar back="/complaints" title="Нове звернення" />
      <Form method="post" className="glass form">
        {GROUPS.map((g) => (
          <ChoiceChips
            key={g.legend}
            name="topic"
            legend={g.legend}
            columns={2}
            options={g.topics.map((t) => ({
              value: t,
              label: TOPIC_LABELS[t],
            }))}
          />
        ))}
        {errors?.topic && <small className="field-error">{errors.topic}</small>}
        <FormField id="place" label="Де" optional error={errors?.place}>
          <input
            id="place"
            name="place"
            maxLength={PLACE_MAX}
            placeholder="5 поверх, кухня"
          />
        </FormField>
        <FormField id="body" label="Що сталося" error={errors?.body}>
          <textarea
            id="body"
            name="body"
            className="area"
            rows={5}
            maxLength={BODY_MAX}
            required
            aria-describedby={errors?.body ? "body-error" : undefined}
          />
        </FormField>
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
          Студрада чи оперзагін побачать ваше імʼя, кімнату й Telegram, щоб
          уточнити деталі. Іншим мешканцям звернення не видно.
        </p>
        <button className="btn btn-primary block" type="submit" disabled={busy}>
          Надіслати
        </button>
      </Form>
      <Credit />
    </>
  );
}
