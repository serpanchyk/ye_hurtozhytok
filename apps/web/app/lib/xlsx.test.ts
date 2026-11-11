import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { buildXlsx, columnLetter, escapeXml, excelSerial } from "./xlsx";

describe("xlsx", () => {
  it("numbers columns like Excel", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
    expect(columnLetter(701)).toBe("ZZ");
  });

  it("converts dates to Excel day numbers", () => {
    expect(excelSerial({ date: "1900-03-01" })).toBe(61);
    expect(excelSerial({ date: "2026-10-22" })).toBe(46317);
    expect(excelSerial({ date: "2026-10-22", time: "18:00" })).toBe(46317.75);
  });

  it("escapes text and drops control characters", () => {
    expect(escapeXml(`<b>"Т&О"</b>\u0007`)).toBe(
      "&lt;b&gt;&quot;Т&amp;О&quot;&lt;/b&gt;",
    );
  });

  it("builds a workbook with one part per sheet", () => {
    const file = buildXlsx([
      {
        name: "Вахти",
        columns: [
          { title: "Дата", width: 12 },
          { title: "Хто", width: 20 },
        ],
        rows: [
          [{ date: "2026-10-22" }, "Антон"],
          [null, 3],
        ],
      },
      {
        name: "Журнал/змін",
        columns: [{ title: "Коли", width: 10 }],
        rows: [],
      },
    ]);
    const parts = unzipSync(file);
    expect(Object.keys(parts)).toEqual(
      expect.arrayContaining([
        "[Content_Types].xml",
        "xl/workbook.xml",
        "xl/worksheets/sheet1.xml",
        "xl/worksheets/sheet2.xml",
      ]),
    );
    const sheet = strFromU8(parts["xl/worksheets/sheet1.xml"]);
    expect(sheet).toContain('<c r="A2" s="2"><v>46317</v></c>');
    expect(sheet).toContain("Антон");
    expect(sheet).toContain('<c r="B3"><v>3</v></c>');
    expect(sheet).toContain('<autoFilter ref="A1:B3"/>');
    expect(strFromU8(parts["xl/workbook.xml"])).toContain('name="Журнал змін"');
  });
});
