import { Form, Link, data, redirect, useNavigation } from "react-router";

import { AnnouncementView } from "~/components/announcement";
import { Check, ConfirmButton } from "~/components/controls";
import { Credit, Icon, TopBar } from "~/components/ui";
import { REASON_MAX } from "~/lib/announcements";
import {
  announcementPage,
  decideAnnouncement,
  deleteAnnouncement,
} from "~/lib/announcements.server";
import { requireProfile } from "~/lib/auth.server";
import { canPublishAnnouncements } from "~/lib/permissions";
import { skipForPhotoViewer } from "~/lib/revalidate";
import type { Route } from "./+types/work-announcement";

export const meta: Route.MetaFunction = ({ data }) => [
  { title: `${data?.a.title ?? "Оголошення"} · єГуртожиток` },
];

export const shouldRevalidate = skipForPhotoViewer;

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  const id = Number(params.id);
  // Only those who publish work with announcements here; others read them.
  if (!canPublishAnnouncements(me)) throw redirect(`/announcements/${id}`);
  const page = await announcementPage(env, me, id);
  if (!page) throw new Response("Такого оголошення немає.", { status: 404 });
  return page;
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const { env, ctx } = context.cloudflare;
  const me = await requireProfile(request, env);
  const id = Number(params.id);
  const form = await request.formData();
  if (form.get("intent") === "delete") {
    const ok =
      canPublishAnnouncements(me) && (await deleteAnnouncement(env, me, id));
    if (!ok) return data({ error: "Видалити не вдалося." }, { status: 403 });
    throw redirect("/work");
  }
  const result = await decideAnnouncement(env, ctx, me, id, form);
  if (!result.ok) return data({ error: result.error }, { status: 400 });
  return { decided: result.status };
}

/** An announcement in the work pages: decide on a proposal, change it, remove it. */
export default function WorkAnnouncement({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { a, today, canDecide } = loaderData;
  const busy = useNavigation().state === "submitting";
  return (
    <>
      <TopBar
        back={canDecide ? "/work/announcements/review" : "/work?s=council"}
        title="Оголошення"
      />

      {actionData && "decided" in actionData && (
        <p className="ok-note" role="status">
          {actionData.decided === "published"
            ? "Опубліковано."
            : "Відхилено, автор побачить пояснення."}
        </p>
      )}
      {actionData && "error" in actionData && (
        <p className="error-note" role="alert">
          {actionData.error}
        </p>
      )}

      <AnnouncementView a={a} today={today} />

      {canDecide && (
        <section className="decide">
          <div className="section-h">
            <h3>Рішення</h3>
          </div>
          <Form method="post" className="glass form">
            <Check
              name="important"
              title="Важливе"
              hint="Зверху на головній і сповіщення всім, хто їх увімкнув."
            />
            <button
              className="btn btn-primary block"
              type="submit"
              name="intent"
              value="publish"
              disabled={busy}
            >
              Опублікувати
            </button>
          </Form>
          <details className="glass reject">
            <summary>Відхилити з поясненням</summary>
            <Form method="post" className="form">
              <div className="field-row">
                <label htmlFor="reason">Що написати автору</label>
                <textarea
                  id="reason"
                  name="reason"
                  className="area"
                  rows={3}
                  maxLength={REASON_MAX}
                  required
                  placeholder="Наприклад: таке оголошення вже є, або бракує дати."
                />
              </div>
              <button
                className="btn btn-soft block"
                type="submit"
                name="intent"
                value="reject"
                disabled={busy}
              >
                Відхилити
              </button>
            </Form>
          </details>
        </section>
      )}

      <div className="ann-actions">
        <Link
          viewTransition
          className="btn btn-soft"
          to={`/work/announcements/${a.id}/edit`}
        >
          <Icon name="pencil" small />
          Змінити
        </Link>
        <Form method="post" className="confirm-form">
          <ConfirmButton
            className="btn btn-ghost-danger block"
            name="intent"
            value="delete"
            question="Видалити оголошення? Його більше ніхто не побачить."
            yes="Так, видалити"
          >
            Видалити
          </ConfirmButton>
        </Form>
      </div>
      <Credit />
    </>
  );
}
