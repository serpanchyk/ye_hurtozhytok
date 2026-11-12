import { Form, data, redirect } from "react-router";

import { AnnouncementForm } from "~/components/announcement-form";
import { ConfirmButton } from "~/components/controls";
import { Credit, TopBar } from "~/components/ui";
import {
  deleteAnnouncement,
  getAnnouncement,
  updateAnnouncement,
} from "~/lib/announcements.server";
import { requireProfile } from "~/lib/auth.server";
import { canPublishAnnouncements } from "~/lib/permissions";
import { WORK_SECTIONS, inWork } from "~/lib/sections";
import { kyivNow } from "~/lib/time";
import { sectionBack } from "~/lib/work-section.server";
import type { Route } from "./+types/announcement-edit";

export const handle = { tab: "home" };
export const meta: Route.MetaFunction = () => [
  { title: "Змінити оголошення · єГуртожиток" },
];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  const a = await getAnnouncement(env, me, Number(params.id));
  if (!a || !a.canEdit)
    throw new Response("Це оголошення змінити не можна.", { status: 403 });
  // Those who publish change announcements in the work pages; the author changes a
  // proposal of their own on its public page.
  const work = canPublishAnnouncements(me);
  if (work !== inWork(new URL(request.url).pathname))
    throw redirect(`${work ? "/work" : ""}/announcements/${a.id}/edit`);
  return {
    base: work ? "/work/announcements" : "/announcements",
    id: a.id,
    canPublish: canPublishAnnouncements(me),
    today: kyivNow().date,
    initial: {
      title: a.title,
      body: a.body,
      place: a.place,
      date: a.date,
      startMin: a.startMin,
      important: a.important,
      images: a.images.map((i) => ({ id: i.id, key: i.key })),
    },
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const { env, ctx } = context.cloudflare;
  const me = await requireProfile(request, env);
  const id = Number(params.id);
  const form = await request.formData();
  // Removing lives here too: the work pages manage an announcement in one place.
  if (form.get("intent") === "delete") {
    if (!(await deleteAnnouncement(env, me, id)))
      throw new Response("Це оголошення видалити не можна.", { status: 403 });
    throw redirect(
      await sectionBack(
        request,
        me,
        WORK_SECTIONS.map((s) => s.id),
      ),
    );
  }
  const result = await updateAnnouncement(env, ctx, me, id, form);
  if (!result)
    throw new Response("Це оголошення змінити не можна.", { status: 403 });
  if (!result.ok) return data({ errors: result.errors }, { status: 400 });
  // A proposal still waiting goes back to its decision; anything else to
  // its page, to see the change.
  const work = inWork(new URL(request.url).pathname);
  throw redirect(
    work && result.status === "pending"
      ? `/work/announcements/${id}`
      : `/announcements/${id}`,
  );
}

export default function EditAnnouncement({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { base, id, canPublish, initial, today } = loaderData;
  return (
    <>
      <TopBar back={`/announcements/${id}`} title="Змінити оголошення" />
      <AnnouncementForm
        today={today}
        initial={initial}
        canPublish={canPublish}
        errors={actionData?.errors}
        submitLabel="Зберегти"
      />
      {base === "/work/announcements" && (
        <Form
          method="post"
          replace
          className="confirm-form"
          style={{ marginTop: 10 }}
        >
          <ConfirmButton
            className="btn btn-ghost-danger block"
            name="intent"
            value="delete"
            question="Видалити оголошення? Його більше ніхто не побачить."
            yes="Так, видалити"
          >
            Видалити оголошення
          </ConfirmButton>
        </Form>
      )}
      <Credit />
    </>
  );
}
