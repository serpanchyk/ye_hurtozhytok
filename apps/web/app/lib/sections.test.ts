import { describe, expect, it } from "vitest";

import { inWork, workSectionsFor } from "./sections";
import { rememberSection, sectionBack } from "./work-section.server";

const ids = (actor: Parameters<typeof workSectionsFor>[0]) =>
  workSectionsFor(actor).map((s) => s.id);

describe("work sections", () => {
  it("gives each role its own tile, the site manager all three", () => {
    expect(ids({ roles: ["council_head"] })).toEqual(["council"]);
    expect(ids({ roles: ["squad"] })).toEqual(["squad"]);
    expect(ids({ roles: ["site_manager"] })).toEqual([
      "council",
      "squad",
      "manager",
    ]);
    expect(ids({ roles: ["site_manager"], blocked: true })).toEqual([]);
    expect(ids({ roles: [] })).toEqual([]);
  });

  it("tells the work pages apart", () => {
    expect(inWork("/work")).toBe(true);
    expect(inWork("/work/board")).toBe(true);
    expect(inWork("/workshop")).toBe(false);
  });
});

describe("back to the section one came from", () => {
  const request = async (section?: "council" | "squad" | "manager") =>
    new Request("http://localhost/work/residents", {
      headers: section
        ? { Cookie: (await rememberSection(section)).split(";")[0] }
        : {},
    });
  const all = ["council", "squad", "manager"] as const;

  it("returns to the section opened last when the page belongs to it", async () => {
    const both = { id: 1, roles: ["council", "squad"] as const };
    expect(await sectionBack(await request("squad"), both, all)).toBe(
      "/work?s=squad",
    );
  });

  it("never leads to a section the person does not have", async () => {
    const council = { id: 1, roles: ["council"] as const };
    expect(await sectionBack(await request("squad"), council, all)).toBe(
      "/work?s=council",
    );
  });

  it("without a cookie takes the first section the page belongs to", async () => {
    const manager = { id: 1, roles: ["site_manager"] as const };
    expect(
      await sectionBack(await request(), manager, ["council", "manager"]),
    ).toBe("/work?s=council");
  });
});
