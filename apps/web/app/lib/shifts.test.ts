import { describe, expect, it } from "vitest";

import {
  canEditShift,
  canLeaveShift,
  canStandShift,
  leadsSquad,
} from "./permissions";
import {
  hasDuty,
  nextDutyDate,
  parseShiftForm,
  rankShiftStats,
} from "./shifts";
import { startOfWeek } from "./time";

function form(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

describe("duty days", () => {
  it("has no duty on Friday and Saturday", () => {
    expect(hasDuty("2026-11-12")).toBe(true); // Thursday
    expect(hasDuty("2026-11-13")).toBe(false); // Friday
    expect(hasDuty("2026-11-14")).toBe(false); // Saturday
    expect(hasDuty("2026-11-15")).toBe(true); // Sunday
  });
  it("moves a Friday to Sunday", () => {
    expect(nextDutyDate("2026-11-13")).toBe("2026-11-15");
    expect(nextDutyDate("2026-11-12")).toBe("2026-11-12");
  });
  it("starts the week on Monday", () => {
    expect(startOfWeek("2026-11-15")).toBe("2026-11-09");
    expect(startOfWeek("2026-11-09")).toBe("2026-11-09");
  });
});

describe("shift form", () => {
  const ctx = { me: 7, leads: false, allowed: [6, 7], today: "2026-11-11" };
  it("takes the shift for oneself or leaves it free", () => {
    expect(
      parseShiftForm(form({ date: "2026-11-12", who: "me" }), ctx),
    ).toEqual({
      ok: true,
      values: { date: "2026-11-12", residentId: 7, note: null },
    });
    const free = parseShiftForm(form({ date: "2026-11-12", who: "free" }), ctx);
    expect(free.ok && free.values.residentId).toBeNull();
  });
  it("refuses Friday and other people for those who do not lead", () => {
    expect(
      parseShiftForm(form({ date: "2026-11-13", who: "me" }), ctx).ok,
    ).toBe(false);
    expect(parseShiftForm(form({ date: "2026-11-12", who: "6" }), ctx).ok).toBe(
      false,
    );
    expect(
      parseShiftForm(form({ date: "2026-11-12", who: "6" }), {
        ...ctx,
        leads: true,
        today: "2026-11-11",
      }).ok,
    ).toBe(true);
    expect(
      parseShiftForm(form({ date: "2026-11-12", who: "99" }), {
        ...ctx,
        leads: true,
        today: "2026-11-11",
      }).ok,
    ).toBe(false);
  });
});

describe("editing a shift", () => {
  it("lets whoever is on it stay when someone else edits it", () => {
    const ctx = {
      me: 7,
      leads: false,
      allowed: [6, 7],
      keep: 6,
      today: "2026-11-11",
    };
    expect(parseShiftForm(form({ date: "2026-11-12", who: "6" }), ctx).ok).toBe(
      true,
    );
  });
});

describe("shift permissions", () => {
  const member = { id: 7, roles: ["squad" as const] };
  const head = { id: 6, roles: ["squad_head" as const] };
  const council = { id: 3, roles: ["council" as const] };
  const manager = { id: 5, roles: ["site_manager" as const] };
  it("lets the squad stand duty and its head and the site manager lead", () => {
    expect(canStandShift(member)).toBe(true);
    expect(canStandShift(council)).toBe(false);
    expect(leadsSquad(head)).toBe(true);
    expect(leadsSquad(manager)).toBe(true);
    expect(leadsSquad(member)).toBe(false);
  });
  const today = "2026-11-11";
  const own = { createdBy: 7, residentId: null, date: "2026-11-12" };
  it("lets members change only their own coming shifts; the head any", () => {
    expect(canEditShift(member, own, today)).toBe(true);
    expect(canEditShift(member, { ...own, residentId: 7 }, today)).toBe(true);
    expect(canEditShift(member, { ...own, createdBy: 6 }, today)).toBe(false);
    expect(canEditShift(head, { ...own, createdBy: 3 }, today)).toBe(true);
    expect(canEditShift(council, { ...own, createdBy: 3 }, today)).toBe(false);
  });
  it("keeps someone who signed up from being taken off by the one who added it", () => {
    expect(canEditShift(member, { ...own, residentId: 6 }, today)).toBe(false);
    expect(canEditShift(head, { ...own, residentId: 6 }, today)).toBe(true);
  });
  it("leaves past shifts to those who lead", () => {
    const past = { ...own, date: "2026-11-10" };
    expect(canEditShift(member, past, today)).toBe(false);
    expect(canEditShift(head, past, today)).toBe(true);
    expect(
      canLeaveShift(member, { residentId: 7, date: "2026-11-10" }, today),
    ).toBe(false);
    expect(
      parseShiftForm(form({ date: "2026-11-10", who: "me" }), {
        me: 7,
        leads: false,
        allowed: [7],
        today,
      }).ok,
    ).toBe(false);
  });
  it("lets the one on duty or the head free a shift", () => {
    const shift = { residentId: 7, date: "2026-11-12" };
    expect(canLeaveShift(member, shift, today)).toBe(true);
    expect(canLeaveShift(member, { ...shift, residentId: 6 }, today)).toBe(
      false,
    );
    expect(canLeaveShift(head, shift, today)).toBe(true);
    expect(canLeaveShift(head, { ...shift, residentId: null }, today)).toBe(
      false,
    );
  });
});

describe("shift statistics", () => {
  it("ranks by total, then this month, sharing places on ties", () => {
    const row = (id: number, name: string, total: number, month = 0) => ({
      id,
      name,
      total,
      month,
    });
    const ranked = rankShiftStats([
      row(1, "Антон", 3, 1),
      row(2, "Микола", 5, 2),
      row(3, "Богдан", 3, 1),
      row(4, "Ігор", 0),
    ]);
    expect(ranked.map((r) => [r.name, r.place])).toEqual([
      ["Микола", 1],
      ["Антон", 2],
      ["Богдан", 2],
      ["Ігор", 4],
    ]);
  });
});
