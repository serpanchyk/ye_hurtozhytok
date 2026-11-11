import { describe, expect, it } from "vitest";

import {
  canEditShift,
  canLeaveShift,
  canStandShift,
  leadsSquad,
} from "./permissions";
import { hasDuty, nextDutyDate, parseShiftForm } from "./shifts";
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
  const ctx = { me: 7, leads: false, allowed: [6, 7] };
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
      }).ok,
    ).toBe(true);
    expect(
      parseShiftForm(form({ date: "2026-11-12", who: "99" }), {
        ...ctx,
        leads: true,
      }).ok,
    ).toBe(false);
  });
});

describe("editing a shift", () => {
  it("lets whoever is on it stay when someone else edits it", () => {
    const ctx = { me: 7, leads: false, allowed: [6, 7], keep: 6 };
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
  it("lets members change only their own shifts; the head any", () => {
    expect(canEditShift(member, { createdBy: 7 })).toBe(true);
    expect(canEditShift(member, { createdBy: 6 })).toBe(false);
    expect(canEditShift(head, { createdBy: 7 })).toBe(true);
    expect(canEditShift(council, { createdBy: 3 })).toBe(false);
  });
  it("lets the one on duty or the head free a shift", () => {
    expect(canLeaveShift(member, { residentId: 7 })).toBe(true);
    expect(canLeaveShift(member, { residentId: 6 })).toBe(false);
    expect(canLeaveShift(head, { residentId: 7 })).toBe(true);
    expect(canLeaveShift(head, { residentId: null })).toBe(false);
  });
});
