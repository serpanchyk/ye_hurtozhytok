import { useEffect } from "react";
import { useLocation } from "react-router";

/**
 * «Назад» goes back the way the person came, like a native app, instead of
 * to a fixed page. Each page is remembered by its place in this tab's history
 * (React Router keeps `idx` in history.state), so the button can skip pages
 * one does not return to: forms already sent and sign-in steps. With nothing
 * to go back to (a page opened from a link or a notification) the button's
 * own fixed page is used, as it is without JavaScript.
 */

const KEY = "eh-places";
type Places = Record<string, string>;

function read(): Places {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as Places;
  } catch {
    return {};
  }
}

function write(places: Places) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(places));
  } catch {
    // Private mode or storage off: «Назад» uses its fixed page.
  }
}

function place(): number | null {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  return typeof idx === "number" ? idx : null;
}

/** Pages one does not go back to: forms (already sent) and sign-in steps. */
export function passThrough(path: string): boolean {
  const pathname = path.split("?")[0];
  return (
    /\/(new|edit)$/.test(pathname) ||
    pathname === "/login" ||
    pathname === "/welcome"
  );
}

/** Remembers which page sits at each place of this tab's history. */
export function useRememberPlaces() {
  const location = useLocation();
  useEffect(() => {
    const i = place();
    if (i === null) return;
    const places = read();
    places[i] = location.pathname + location.search;
    write(places);
  }, [location.key, location.pathname, location.search]);
}

/**
 * How many steps back the last page worth returning to is (a negative
 * number), or null when there is none in this tab's history.
 */
export function backSteps(): number | null {
  const i = place();
  if (i === null) return null;
  const places = read();
  const here = places[i] ?? location.pathname + location.search;
  for (let j = i - 1; j >= 0; j--) {
    const p = places[j];
    if (p === undefined) return null;
    if (passThrough(p) || p === here) continue;
    return j - i;
  }
  return null;
}
