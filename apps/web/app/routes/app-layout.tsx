import { useRef } from "react";
import { Outlet, useMatches } from "react-router";

import { TabBar, type Tab } from "~/components/ui";
import { DevSwitcher } from "~/components/dev-switcher";
import {
  devAccounts,
  devLoginEnabled,
  requireProfile,
} from "~/lib/auth.server";
import { useNavDirection } from "~/lib/nav-direction";
import { inWork } from "~/lib/sections";
import { useSteadyScroll } from "~/lib/use-steady-scroll";
import { skipForPhotoViewer } from "~/lib/revalidate";
import type { Route } from "./+types/app-layout";

export const shouldRevalidate = skipForPhotoViewer;

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const r = await requireProfile(request, env);
  return {
    resident: { id: r.id, name: r.name, roles: r.roles, blocked: r.blocked },
    // Local development only: people to switch to with Ctrl+Shift+U.
    dev: devLoginEnabled(env, request) ? await devAccounts(env) : null,
  };
}

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  useNavDirection();
  const pageRef = useRef<HTMLElement>(null);
  useSteadyScroll(pageRef);
  const matches = useMatches();
  const last = matches.at(-1);
  const handle = last?.handle as
    { tab?: Tab; sheet?: boolean; wide?: boolean } | undefined;
  const tab = last && inWork(last.pathname) ? "services" : handle?.tab;
  return (
    <>
      <main ref={pageRef} className={handle?.wide ? "page wide" : "page"}>
        <Outlet />
      </main>
      {!handle?.sheet && <TabBar active={tab ?? null} />}
      {loaderData.dev && (
        <DevSwitcher people={loaderData.dev} me={loaderData.resident.id} />
      )}
    </>
  );
}
