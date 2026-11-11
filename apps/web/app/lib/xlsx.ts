/**
 * A minimal Excel (.xlsx) writer: plain tables with a bold header row, frozen
 * header, filters and real dates, so the file sorts and filters properly.
 */
import { strToU8, zipSync } from "fflate";

/** A calendar date ("YYYY-MM-DD") or a Kyiv wall-clock moment, both shown as Excel dates. */
export type DateCell = { date: string; time?: string };

export type Cell = string | number | null | undefined | DateCell;

export type Column = { title: string; width: number };

export type Sheet = { name: string; columns: Column[]; rows: Cell[][] };

const STYLE_HEADER = 1;
const STYLE_DATE = 2;
const STYLE_DATE_TIME = 3;
const STYLE_TEXT = 4;

/** Days since 1899-12-30, Excel's day zero, with the time of day as a fraction. */
export function excelSerial(cell: DateCell): number {
  const [y, m, d] = cell.date.split("-").map(Number);
  const [h, min] = (cell.time ?? "00:00").split(":").map(Number);
  return (Date.UTC(y, m - 1, d, h, min) - Date.UTC(1899, 11, 30)) / 86_400_000;
}

/** 0 → "A", 26 → "AA". */
export function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    letters = String.fromCharCode(65 + rest) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export function escapeXml(value: string): string {
  return (
    value
      // Control characters are not allowed in XML at all.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  );
}

function cellXml(ref: string, cell: Cell): string {
  if (cell === null || cell === undefined || cell === "") return "";
  if (typeof cell === "number") return `<c r="${ref}"><v>${cell}</v></c>`;
  if (typeof cell === "string")
    return `<c r="${ref}" t="inlineStr" s="${STYLE_TEXT}"><is><t xml:space="preserve">${escapeXml(cell)}</t></is></c>`;
  const style = cell.time ? STYLE_DATE_TIME : STYLE_DATE;
  return `<c r="${ref}" s="${style}"><v>${excelSerial(cell)}</v></c>`;
}

function sheetXml(sheet: Sheet): string {
  const header = sheet.columns
    .map(
      (col, i) =>
        `<c r="${columnLetter(i)}1" t="inlineStr" s="${STYLE_HEADER}"><is><t>${escapeXml(col.title)}</t></is></c>`,
    )
    .join("");
  const body = sheet.rows
    .map(
      (row, r) =>
        `<row r="${r + 2}">${row
          .map((cell, c) => cellXml(`${columnLetter(c)}${r + 2}`, cell))
          .join("")}</row>`,
    )
    .join("");
  const cols = sheet.columns
    .map(
      (col, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${col.width}" customWidth="1"/>`,
    )
    .join("");
  const last = `${columnLetter(sheet.columns.length - 1)}${sheet.rows.length + 1}`;

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${cols}</cols>` +
    `<sheetData><row r="1">${header}</row>${body}</sheetData>` +
    `<autoFilter ref="A1:${last}"/>` +
    `</worksheet>`
  );
}

const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="2"><numFmt numFmtId="164" formatCode="dd.mm.yyyy"/><numFmt numFmtId="165" formatCode="dd.mm.yyyy hh:mm"/></numFmts>` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFE6E1D8"/></patternFill></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="5">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

/** Sheet names: at most 31 characters, none of []:*?/\ . */
function safeSheetName(name: string): string {
  return name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31);
}

export function buildXlsx(sheets: Sheet[]): Uint8Array {
  const sheetEntries = sheets
    .map(
      (sheet, i) =>
        `<sheet name="${escapeXml(safeSheetName(sheet.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    )
    .join("");
  const filters = sheets
    .map(
      (sheet, i) =>
        `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${escapeXml(safeSheetName(sheet.name))}'!$A$1:$${columnLetter(sheet.columns.length - 1)}$${sheet.rows.length + 1}</definedName>`,
    )
    .join("");

  const files: Record<string, string> = {
    "[Content_Types].xml":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      sheets
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join("") +
      `</Types>`,
    "_rels/.rels":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`,
    "xl/workbook.xml":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets>${sheetEntries}</sheets><definedNames>${filters}</definedNames></workbook>`,
    "xl/_rels/workbook.xml.rels":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join("") +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`,
    "xl/styles.xml": STYLES,
  };
  sheets.forEach((sheet, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(sheet);
  });

  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([path, xml]) => [path, strToU8(xml)]),
    ),
  );
}
