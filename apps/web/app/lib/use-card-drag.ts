import { useEffect, useRef, type RefObject } from "react";

/**
 * How long a finger rests on a card before it lifts: longer than a pause
 * before scrolling, a little shorter than the phone's own long press.
 */
const HOLD_MS = 450;
/** Movement that turns a touch into a scroll, or a mouse press into a drag. */
const SLOP = 8;
/** Distance from the top, or from the tab bar, where the page scrolls by itself. */
const EDGE = 90;
const MAX_SCROLL = 14;

/**
 * Drags cards between columns with a finger or a mouse. Cards are the
 * container's `[data-task]` elements (with `data-status`), columns its
 * `[data-drop]` elements (the status they stand for). On touch a card lifts
 * after a short hold, with a mouse after a small move. A copy follows the
 * pointer, the column under it lights up, the page scrolls near the edges,
 * and Escape cancels. Dropping on another column calls `onDrop`; otherwise
 * the copy glides back. The click that ends a drag never opens the card.
 */
export function useCardDrag(
  ref: RefObject<HTMLElement | null>,
  {
    enabled,
    onDrop,
  }: { enabled: boolean; onDrop: (id: number, to: string) => void },
) {
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;

  useEffect(() => {
    const found = ref.current;
    if (!enabled || !found) return;
    const root: HTMLElement = found;

    type Press = {
      id: number;
      card: HTMLElement;
      x: number;
      y: number;
      pointerId: number;
      touch: boolean;
      timer?: number;
    };
    type Drag = {
      ghost: HTMLElement;
      over: HTMLElement | null;
      x: number;
      y: number;
      raf: number;
    };
    let press: Press | null = null;
    let drag: Drag | null = null;

    const columnAt = (x: number, y: number) => {
      const el = document
        .elementFromPoint(x, y)
        ?.closest<HTMLElement>("[data-drop]");
      return el && root.contains(el) ? el : null;
    };

    function follow(x: number, y: number) {
      if (!drag || !press) return;
      drag.x = x;
      drag.y = y;
      drag.ghost.style.transform = `translate(${x - press.x}px, ${y - press.y}px) rotate(1.5deg) scale(1.03)`;
      const over = columnAt(x, y);
      if (over !== drag.over) {
        drag.over?.classList.remove("is-drop-target");
        over?.classList.add("is-drop-target");
        drag.over = over;
      }
    }

    // Near the top, or just above the tab bar, the page scrolls on its own.
    function scrollNearEdges() {
      if (!drag) return;
      const bottom =
        document.querySelector(".tabbar")?.getBoundingClientRect().top ??
        innerHeight;
      const { y } = drag;
      const speed =
        y > bottom - EDGE
          ? ((y - (bottom - EDGE)) / EDGE) * MAX_SCROLL
          : y < EDGE
            ? -((EDGE - y) / EDGE) * MAX_SCROLL
            : 0;
      if (speed) {
        scrollBy(0, speed);
        follow(drag.x, drag.y);
      }
      drag.raf = requestAnimationFrame(scrollNearEdges);
    }

    function lift() {
      if (!press) return;
      const rect = press.card.getBoundingClientRect();
      const ghost = press.card.cloneNode(true) as HTMLElement;
      ghost.classList.add("task-ghost");
      ghost.removeAttribute("data-task");
      ghost.setAttribute("aria-hidden", "true");
      ghost.style.left = `${rect.left}px`;
      ghost.style.top = `${rect.top}px`;
      ghost.style.width = `${rect.width}px`;
      document.body.appendChild(ghost);
      press.card.classList.add("is-lifted");
      document.documentElement.classList.add("is-dragging");
      drag = { ghost, over: null, x: press.x, y: press.y, raf: 0 };
      follow(press.x, press.y);
      drag.raf = requestAnimationFrame(scrollNearEdges);
      navigator.vibrate?.(8);
    }

    // The click that follows a drag must not open the card.
    function swallowNextClick() {
      const stop = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
      };
      root.addEventListener("click", stop, { capture: true, once: true });
      setTimeout(() => root.removeEventListener("click", stop, true), 400);
    }

    function end(cancelled: boolean) {
      if (press) clearTimeout(press.timer);
      if (drag && press) {
        cancelAnimationFrame(drag.raf);
        drag.over?.classList.remove("is-drop-target");
        document.documentElement.classList.remove("is-dragging");
        swallowNextClick();
        const { ghost, over } = drag;
        const card = press.card;
        const to = over?.dataset.drop;
        if (!cancelled && to && to !== card.dataset.status) {
          ghost.remove();
          card.classList.remove("is-lifted");
          dropRef.current(press.id, to);
        } else {
          // Glide back to where the card still is.
          const r = card.getBoundingClientRect();
          ghost.classList.add("is-settling");
          ghost.style.transform = `translate(${r.left - parseFloat(ghost.style.left)}px, ${r.top - parseFloat(ghost.style.top)}px)`;
          const settle = () => {
            ghost.remove();
            card.classList.remove("is-lifted");
          };
          ghost.addEventListener("transitionend", settle, { once: true });
          setTimeout(settle, 400);
        }
      }
      press = null;
      drag = null;
    }

    function onDown(e: PointerEvent) {
      if (e.button !== 0 || press) return;
      const card = (e.target as Element).closest<HTMLElement>("[data-task]");
      if (!card || !root.contains(card)) return;
      const touch = e.pointerType !== "mouse";
      press = {
        id: Number(card.dataset.task),
        card,
        x: e.clientX,
        y: e.clientY,
        pointerId: e.pointerId,
        touch,
      };
      if (touch) press.timer = window.setTimeout(lift, HOLD_MS);
    }
    function onMove(e: PointerEvent) {
      if (!press || e.pointerId !== press.pointerId) return;
      if (drag) return follow(e.clientX, e.clientY);
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) <= SLOP) return;
      if (press.touch) {
        // Moved before the hold: the person is scrolling.
        clearTimeout(press.timer);
        press = null;
      } else {
        lift();
        follow(e.clientX, e.clientY);
      }
    }
    function onUp(e: PointerEvent) {
      if (press && e.pointerId === press.pointerId) end(false);
    }
    function onCancel(e: PointerEvent) {
      if (press && e.pointerId === press.pointerId) end(true);
    }
    // While a card is lifted the finger moves it, not the page.
    function onTouchMove(e: TouchEvent) {
      if (drag) e.preventDefault();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && drag) end(true);
    }
    // No long-press menu and no native link dragging on cards.
    function onContextMenu(e: Event) {
      if (press?.touch || drag) e.preventDefault();
    }
    function onNativeDrag(e: Event) {
      if ((e.target as Element).closest?.("[data-task]")) e.preventDefault();
    }

    root.addEventListener("pointerdown", onDown);
    root.addEventListener("contextmenu", onContextMenu);
    root.addEventListener("dragstart", onNativeDrag);
    addEventListener("pointermove", onMove);
    addEventListener("pointerup", onUp);
    addEventListener("pointercancel", onCancel);
    addEventListener("keydown", onKey);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      end(true);
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("contextmenu", onContextMenu);
      root.removeEventListener("dragstart", onNativeDrag);
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerup", onUp);
      removeEventListener("pointercancel", onCancel);
      removeEventListener("keydown", onKey);
      document.removeEventListener("touchmove", onTouchMove);
    };
  }, [ref, enabled]);
}
