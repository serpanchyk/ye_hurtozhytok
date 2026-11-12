import { Form, Link, data, redirect } from "react-router";

import { AnnouncementView } from "~/components/announcement";
import { ConfirmButton } from "~/components/controls";
import { Credit, Icon, TopBar } from "~/components/ui";
import {
  announcementPage,
  deleteAnnouncement,
} from "~/lib/announcements.server";
import { requireProfile } from "~/lib/auth.server";
import { canPublishAnnouncements } from "~/lib/permissions";
import { skipForPhotoViewer } from "~/lib/revalidate";
import type { Route } from "./+types/announcement";

export const handle = { tab: "home" };
export const meta: Route.MetaFunction = ({ data }) => [
  { title: `${data?.a.title ?? "Оголошення"} · єГуртожиток` },
];

export const shouldRevalidate = skipForPhotoViewer;

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  const page = await announcementPage(env, me, Number(params.id));
  if (!page)
    throw new Response("Такого оголошення немає або воно не для вас.", {
      status: 404,
    });
  return {
    ...page,
    // The author changes or withdraws their own proposal here; everything
    // else people with the right do in the work pages.
    ownProposal: page.mine && page.a.status === "pending",
    manage: canPublishAnnouncements(me) && page.canEdit,
    sent: new URL(request.url).searchParams.get("sent") === "1",
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  const id = Number(params.id);
  const form = await request.formData();
  const page = await announcementPage(env, me, id);
  const own = page?.mine && page.a.status === "pending";
  if (form.get("intent") !== "delete" || !own)
    return data({ error: "Так зробити не можна." }, { status: 403 });
  if (!(await deleteAnnouncement(env, me, id)))
    return data({ error: "Забрати не вдалося." }, { status: 403 });
  throw redirect("/");
}

/** An announcement to read; its author manages a proposal still under review. */
export default function AnnouncementPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { a, today, ownProposal, manage, sent } = loaderData;
  return (
    <>
      <TopBar back="/" title="Оголошення" />

      {sent && a.status === "pending" && (
        <p className="ok-note" role="status">
          Надіслано на розгляд. Коли студрада вирішить, прийде сповіщення.
        </p>
      )}
      {actionData && "error" in actionData && (
        <p className="error-note" role="alert">
          {actionData.error}
        </p>
      )}

      <AnnouncementView a={a} today={today} />

      {ownProposal && (
        <div className="ann-actions">
          <Link
            viewTransition
            className="btn btn-soft"
            to={`/announcements/${a.id}/edit`}
          >
            <Icon name="pencil" small />
            Змінити
          </Link>
          <Form method="post" replace className="confirm-form">
            <ConfirmButton
              className="btn btn-ghost-danger block"
              name="intent"
              value="delete"
              question="Забрати цю пропозицію?"
              yes="Так, забрати"
            >
              Забрати
            </ConfirmButton>
          </Form>
        </div>
      )}
      {manage && (
        <div className="home-actions">
          <Link
            viewTransition
            className="btn btn-soft block"
            to={`/work/announcements/${a.id}${a.status === "pending" ? "" : "/edit"}`}
          >
            <Icon name="pencil" small />
            Керувати оголошенням
          </Link>
        </div>
      )}
      <Credit />
    </>
  );
}
