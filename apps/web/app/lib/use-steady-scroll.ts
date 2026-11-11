import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useLocation } from "react-router";

const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Switching within a page (a filter, a board tab, a day) must not make the
 * page jump. When the new content is shorter, the browser would pull the
 * scroll up to fit; instead the page grows just enough to stay where the
 * person was, before anything is painted. Leaving the page drops the extra
 * height.
 */
export function useSteadyScroll(ref: RefObject<HTMLElement | null>) {
  const location = useLocation();
  const last = useRef({ path: location.pathname, y: 0 });

  useEffect(() => {
    const remember = () => (last.current.y = scrollY);
    addEventListener("scroll", remember, { passive: true });
    return () => removeEventListener("scroll", remember);
  }, []);

  useIso(() => {
    const page = ref.current;
    if (!page) return;
    if (location.pathname !== last.current.path) {
      last.current.path = location.pathname;
      page.style.minHeight = "";
      return;
    }
    const want = last.current.y;
    // Reading scrollY lays the new content out; if it moved up, it was pulled.
    if (scrollY >= want) return;
    // Tall enough that its bottom reaches the bottom of the screen at `want`.
    const top = page.getBoundingClientRect().top + scrollY;
    page.style.minHeight = `${Math.ceil(want + innerHeight - top)}px`;
    scrollTo(0, want);
  }, [location.key]);
}
