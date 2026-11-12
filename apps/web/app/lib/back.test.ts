import { describe, expect, it } from "vitest";

import { passThrough } from "./back";

describe("«Назад» skips", () => {
  it("forms already sent and sign-in steps", () => {
    expect(passThrough("/work/tasks/new?b=squad")).toBe(true);
    expect(passThrough("/work/tasks/12/edit")).toBe(true);
    expect(passThrough("/announcements/new")).toBe(true);
    expect(passThrough("/login?next=%2Fservices")).toBe(true);
    expect(passThrough("/welcome")).toBe(true);
  });

  it("but not the pages one reads", () => {
    expect(passThrough("/work/board?b=squad")).toBe(false);
    expect(passThrough("/work/tasks/12")).toBe(false);
    expect(passThrough("/news")).toBe(false);
  });
});
