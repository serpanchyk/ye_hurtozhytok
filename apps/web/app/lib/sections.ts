import type { IconName } from "~/components/ui";

import { isCouncil, isSiteManager, isSquad } from "./permissions";

/**
 * The bottom menu in order. Everything else lives in «Послуги», so the menu
 * does not grow with every new service.
 */
export const SECTIONS = [
  { id: "home", to: "/", icon: "home", label: "Головна" },
  { id: "services", to: "/services", icon: "grid", label: "Послуги" },
  { id: "me", to: "/me", icon: "user", label: "Моє" },
] as const satisfies readonly {
  id: string;
  to: string;
  icon: IconName;
  label: string;
}[];

export type Tab = (typeof SECTIONS)[number]["id"] | null;

/**
 * The work sections, each its own tile on «Послуги»: the council's, the
 * squad's and the site manager's («Управа»). Their pages live under /work
 * and belong to «Послуги» in the menu.
 */
export const WORK_SECTIONS = [
  { id: "council", label: "Студрада", icon: "work" },
  { id: "squad", label: "Оперзагін", icon: "shield" },
  { id: "manager", label: "Управа", icon: "user" },
] as const satisfies readonly { id: string; label: string; icon: IconName }[];
export type WorkSection = (typeof WORK_SECTIONS)[number]["id"];

/** The work sections this person has, in menu order. */
export function workSectionsFor(actor: Parameters<typeof isCouncil>[0]) {
  return WORK_SECTIONS.filter((s) =>
    s.id === "council"
      ? isCouncil(actor)
      : s.id === "squad"
        ? isSquad(actor)
        : isSiteManager(actor),
  );
}

export const workHref = (s: WorkSection) => `/work?s=${s}`;

export function inWork(pathname: string): boolean {
  return pathname === "/work" || pathname.startsWith("/work/");
}
