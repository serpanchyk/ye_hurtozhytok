import { describe, expect, it } from "vitest";

import {
  columns,
  defaultPublic,
  historyLabel,
  parseTaskForm,
  readFilter,
} from "./tasks";

function form(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

describe("task form", () => {
  it("trims and keeps empty optional fields as null", () => {
    const r = parseTaskForm(
      form({ title: "  Замінити   лампу ", place: " ", public: "on" }),
    );
    expect(r).toEqual({
      ok: true,
      values: {
        title: "Замінити лампу",
        details: null,
        place: null,
        public: true,
      },
    });
  });
  it("needs a title and keeps a card private without the tick", () => {
    expect(parseTaskForm(form({ title: "ок" })).ok).toBe(false);
    const r = parseTaskForm(form({ title: "Перевірити двері" }));
    expect(r.ok && r.values.public).toBe(false);
  });
});

describe("task rules", () => {
  it("starts council cards public and squad cards private", () => {
    expect(defaultPublic("council")).toBe(true);
    expect(defaultPublic("squad")).toBe(false);
  });
  it("filters cards into columns", () => {
    const cards = [
      { id: 1, status: "new" as const, assigneeIds: [] },
      { id: 2, status: "in_progress" as const, assigneeIds: [7] },
      { id: 3, status: "in_progress" as const, assigneeIds: [8] },
      { id: 4, status: "done" as const, assigneeIds: [7, 8] },
    ];
    const ids = (c: Record<string, { id: number }[]>) =>
      Object.fromEntries(
        Object.entries(c).map(([k, v]) => [k, v.map((x) => x.id)]),
      );
    expect(ids(columns(cards, "all", 7))).toEqual({
      new: [1],
      in_progress: [2, 3],
      done: [4],
    });
    expect(ids(columns(cards, "mine", 7))).toEqual({
      new: [],
      in_progress: [2],
      done: [4],
    });
    expect(ids(columns(cards, "free", 7))).toEqual({
      new: [1],
      in_progress: [],
      done: [],
    });
  });
  it("reads unknown filters as «усі»", () => {
    expect(readFilter("mine")).toBe("mine");
    expect(readFilter("x")).toBe("all");
    expect(readFilter(null)).toBe("all");
  });
  it("describes history entries", () => {
    expect(historyLabel("task.status", '{"status":"done"}')).toBe(
      "переносить у «Готово»",
    );
    expect(historyLabel("task.moved", '{"from":"squad","to":"council"}')).toBe(
      "передає з дошки «Оперзагін» студраді",
    );
    expect(historyLabel("task.status", "not json")).toBe("змінює статус");
  });
});
