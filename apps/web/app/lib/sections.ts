import type { IconName } from "~/components/ui";

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

/** «Праця» lives at /work; its pages belong to «Послуги». */
export function inWork(pathname: string): boolean {
  return pathname === "/work" || pathname.startsWith("/work/");
}
