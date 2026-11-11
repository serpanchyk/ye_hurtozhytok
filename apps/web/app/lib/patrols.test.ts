import { describe, expect, it } from "vitest";

import { parsePatrolForm, taskTitleFromNotes } from "./patrols";
import { canEditPatrol } from "./permissions";

function form(values: Record<string, string | string[]>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values))
    for (const x of [v].flat()) f.append(k, x);
  return f;
}

describe("patrols", () => {
  it("keeps only people from the squad and needs someone", () => {
    const r = parsePatrolForm(
      form({ date: "2026-11-13", status: "done", people: ["6", "7", "99"] }),
      [6, 7],
    );
    expect(r.ok && r.values.people).toEqual([6, 7]);
    expect(
      parsePatrolForm(form({ date: "2026-11-13", people: ["99"] }), [6, 7]).ok,
    ).toBe(false);
  });
  it("happens any day, Friday too, done or planned", () => {
    const r = parsePatrolForm(
      form({ date: "2026-11-13", status: "planned", people: "6" }),
      [6],
    );
    expect(r.ok && r.values.status).toBe("planned");
  });
  it("names a card by the notes' first line", () => {
    expect(taskTitleFromNotes("Двері не зачиняються\nна 2 поверсі")).toBe(
      "Двері не зачиняються",
    );
    expect(taskTitleFromNotes("а".repeat(100))).toHaveLength(80);
  });
  it("lets the head change any patrol and others their own", () => {
    const member = { id: 7, roles: ["squad" as const] };
    const head = { id: 6, roles: ["squad_head" as const] };
    expect(canEditPatrol(member, { createdBy: 7 })).toBe(true);
    expect(canEditPatrol(member, { createdBy: 6 })).toBe(false);
    expect(canEditPatrol(head, { createdBy: 7 })).toBe(true);
  });
});
