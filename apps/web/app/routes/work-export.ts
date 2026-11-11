import { redirect } from "react-router";

import { requireProfile } from "~/lib/auth.server";
import { exportFileName } from "~/lib/export";
import { squadWorkbook } from "~/lib/export.server";
import { leadsSquad } from "~/lib/permissions";
import { kyivNow } from "~/lib/time";
import type { Route } from "./+types/work-export";

/** The squad's Excel file, for its head and the site manager. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  if (!leadsSquad(me)) throw redirect("/work");
  const today = kyivNow().date;
  const file = await squadWorkbook(env, today);
  // zipSync always returns a fresh buffer, never a view over a shared one.
  return new Response(file as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${exportFileName(today)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
