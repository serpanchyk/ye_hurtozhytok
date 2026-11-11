import { useEffect, useRef } from "react";
import { Form, useLocation } from "react-router";

import type { DevAccount } from "~/lib/auth.server";
import { initials, roomLabel } from "~/lib/profile";
import { ROLE_LABELS } from "~/lib/roles";

const GROUPS: { label: string; has: (p: DevAccount) => boolean }[] = [
  { label: "Мешканець", has: (p) => p.roles.length === 0 },
  {
    label: "Студрада",
    has: (p) => p.roles.includes("council") || p.roles.includes("council_head"),
  },
  {
    label: "Оперзагін",
    has: (p) => p.roles.includes("squad") || p.roles.includes("squad_head"),
  },
  { label: "Розпорядник", has: (p) => p.roles.includes("site_manager") },
];

/**
 * Local development only: Ctrl+Shift+U opens «Увійти як» with the local
 * people by role; a tap signs in as that person through the development
 * sign-in and stays on the same page.
 */
export function DevSwitcher({
  people,
  me,
}: {
  people: DevAccount[];
  me: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const location = useLocation();
  const next = location.pathname + location.search;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // By key position, so it works with the Ukrainian layout too.
      if (!e.ctrlKey || !e.shiftKey || e.code !== "KeyU") return;
      e.preventDefault();
      const d = ref.current;
      if (d?.open) d.close();
      else d?.showModal();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => ref.current?.close(), [location.key]);

  return (
    <dialog
      ref={ref}
      className="glass dev-switch"
      aria-label="Увійти як"
      // A click on the dimmed backdrop closes the window.
      onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
    >
      <div className="section-h" style={{ marginTop: 0 }}>
        <h3>Увійти як</h3>
        <span className="muted">Ctrl+Shift+U</span>
      </div>
      {GROUPS.map((g) => {
        const list = people.filter(g.has);
        if (!list.length) return null;
        return (
          <section key={g.label}>
            <p className="label-like dev-switch-label">{g.label}</p>
            <div className="glass" style={{ padding: "4px 0" }}>
              {list.map((p) => (
                <Form method="post" action="/login" key={p.email}>
                  <input type="hidden" name="email" value={p.email} />
                  <input type="hidden" name="name" value={p.name} />
                  <input type="hidden" name="next" value={next} />
                  <button
                    className="list-row dev-switch-row"
                    type="submit"
                    aria-current={p.id === me ? "true" : undefined}
                  >
                    <span className="who-av">{initials(p.name)}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b>{p.name}</b>
                      <span className="sub">
                        {[
                          ...p.roles.map((r) => ROLE_LABELS[r]),
                          roomLabel(p.room),
                          ...(p.blocked ? ["заблоковано"] : []),
                        ].join(" · ")}
                      </span>
                    </span>
                  </button>
                </Form>
              ))}
            </div>
          </section>
        );
      })}
    </dialog>
  );
}
