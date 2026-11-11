import { createCookie } from "react-router";

import type { Actor } from "./permissions";
import { workHref, workSectionsFor, type WorkSection } from "./sections";

/**
 * The work section opened last. A page several sections link to (residents,
 * proposals, a new announcement) leads back to the one the person came from.
 */
const lastSection = createCookie("eh_section", {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
});

/** The Set-Cookie value that remembers the section just opened. */
export function rememberSection(section: WorkSection): Promise<string> {
  return lastSection.serialize(section);
}

/**
 * Back to the section the person came from when this page belongs to it,
 * otherwise to the first of `among` they have.
 */
export async function sectionBack(
  request: Request,
  actor: Actor,
  among: readonly WorkSection[],
): Promise<string> {
  const mine = workSectionsFor(actor)
    .map((s) => s.id)
    .filter((s) => among.includes(s));
  const last: unknown = await lastSection.parse(request.headers.get("Cookie"));
  const section = mine.find((s) => s === last) ?? mine[0] ?? among[0];
  return workHref(section);
}
