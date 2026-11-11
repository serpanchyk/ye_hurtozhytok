import { Outlet, useMatches } from "react-router";

import { TabBar, type Tab } from "~/components/ui";
import { DevSwitcher } from "~/components/dev-switcher";
import {
  devAccounts,
  devLoginEnabled,
  requireProfile,
} from "~/lib/auth.server";
import { isCouncil, isSquad } from "~/lib/permissions";
import { useNavDirection } from "~/lib/nav-direction";
import { skipForPhotoViewer } from "~/lib/revalidate";
import type { Route } from "./+types/app-layout";

export const shouldRevalidate = skipForPhotoViewer;

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const r = await requireProfile(request, env);
  return {
    resident: { id: r.id, name: r.name, roles: r.roles, blocked: r.blocked },
    work: isCouncil(r) || isSquad(r),
    // Local development only: people to switch to with Ctrl+Shift+U.
    dev: devLoginEnabled(env, request) ? await devAccounts(env) : null,
  };
}

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  useNavDirection();
  const matches = useMatches();
  const handle = matches.at(-1)?.handle as
    { tab?: Tab; sheet?: boolean; wide?: boolean } | undefined;
  return (
    <>
      <main className={handle?.wide ? "page wide" : "page"}>
        <Outlet />
      </main>
      {!handle?.sheet && (
        <TabBar active={handle?.tab ?? null} work={loaderData.work} />
      )}
      {loaderData.dev && (
        <DevSwitcher people={loaderData.dev} me={loaderData.resident.id} />
      )}
    </>
  );
}
