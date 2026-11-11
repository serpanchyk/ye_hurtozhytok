import { useEffect } from "react";
import { useLocation } from "react-router";

import { SECTIONS } from "./sections";

/** A touch that starts this close to the left edge is a «Назад» swipe. */
const EDGE = 24;
/** How far, how straight and how quick a finger must move to count. */
const MIN_DX = 70;
const STRAIGHT = 1.8;
const MAX_MS = 700;

/** Where the gesture must not compete with what is under the finger. */
const OWN_GESTURES =
  "input, textarea, select, [contenteditable], dialog, [data-task], [data-no-swipe]";

function ownsGesture(start: Element | null): boolean {
  for (let n = start; n && n !== document.body; n = n.parentElement) {
    if (n.matches(OWN_GESTURES)) return true;
    // Rows that scroll sideways (days, filters, pictures, the time scale).
    const { overflowX } = getComputedStyle(n);
    if (
      (overflowX === "auto" || overflowX === "scroll") &&
      n.scrollWidth > n.clientWidth + 1
    )
      return true;
  }
  return false;
}

/** Safari on iPhone already goes back from the edge, except an installed app. */
function nativeEdgeBack(): boolean {
  const ios =
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed =
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true;
  return ios && !installed;
}

/**
 * Finger swipes, like in a native app. On a menu section (Головна, Послуги,
 * Моє) a swipe sideways opens the next or previous section; from the left
 * edge of any inner page it goes «Назад». Both tap the existing menu tab or
 * back button, so the page slides the same way as on a tap. Rows that
 * scroll sideways, fields, cards that drag and open windows keep their own
 * gestures. Only touch: a mouse never navigates this way.
 */
export function useSwipeNav() {
  const { pathname } = useLocation();

  useEffect(() => {
    const section = SECTIONS.findIndex((s) => s.to === pathname);
    const edgeBack = !nativeEdgeBack();
    let start: { x: number; y: number; t: number; edge: boolean } | null = null;

    const onStart = (e: TouchEvent) => {
      const root = document.documentElement;
      if (
        e.touches.length !== 1 ||
        root.classList.contains("viewer-open") ||
        root.classList.contains("is-dragging")
      ) {
        start = null;
        return;
      }
      const t = e.touches[0];
      const edge = edgeBack && t.clientX <= EDGE;
      start =
        edge || !ownsGesture(e.target as Element)
          ? { x: t.clientX, y: t.clientY, t: performance.now(), edge }
          : null;
    };

    const onEnd = (e: TouchEvent) => {
      const s = start;
      start = null;
      if (!s || document.documentElement.classList.contains("is-dragging"))
        return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (
        Math.abs(dx) < MIN_DX ||
        Math.abs(dx) < Math.abs(dy) * STRAIGHT ||
        performance.now() - s.t > MAX_MS
      )
        return;
      const back = document.querySelector<HTMLElement>(".topbar .icon-btn");
      const tabs = document.querySelectorAll<HTMLElement>(".tabbar .tab");
      if (dx > 0 && s.edge && back) back.click();
      else if (section >= 0 && dx > 0 && section > 0)
        tabs[section - 1]?.click();
      else if (section >= 0 && dx < 0 && section < SECTIONS.length - 1)
        tabs[section + 1]?.click();
    };

    const onCancel = () => (start = null);
    addEventListener("touchstart", onStart, { passive: true });
    addEventListener("touchend", onEnd, { passive: true });
    addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      removeEventListener("touchstart", onStart);
      removeEventListener("touchend", onEnd);
      removeEventListener("touchcancel", onCancel);
    };
  }, [pathname]);
}
