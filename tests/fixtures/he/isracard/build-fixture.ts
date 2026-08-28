/**
 * Builds the synthetic Isracard fixture.
 *
 * Every value here is invented. No part of it derives from a real statement, and it must
 * stay that way: this file is public. See SANITIZATION.md.
 *
 * The generated workbook imitates the shape of a real Isracard export, including the `x:`
 * namespace prefixes and inline rich-text runs that made a general spreadsheet library
 * fail to open one. Regenerate with:
 *
 *   node tests/fixtures/he/isracard/build-fixture.ts
 */
import { zipSync, strToU8 } from "fflate";
import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

type Cell = { column: string; value: string | number; details?: readonly string[] };

const SHEET_NAME = "פירוט עסקאות";

/**
 * Amounts are chosen so the rows sum exactly to the stated total, which is what the
 * importer checks. Changing a row means changing the total.
 */
const TRANSACTIONS: readonly Cell[][] = [
  [
    { column: "A", value: "14.08.26" },
    { column: "B", value: "חנות הספרים לדוגמה" },
    { column: "C", value: 214 },
    { column: "D", value: "₪" },
    { column: "E", value: 214 },
    { column: "F", value: "₪" },
    { column: "G", value: "900000001" },
  ],
  [
    { column: "A", value: "12.08.26" },
    { column: "B", value: "EXAMPLE HOSTING          " },
    { column: "C", value: 10 },
    { column: "D", value: "$" },
    { column: "E", value: 33.1 },
    { column: "F", value: "₪" },
    { column: "G", value: "900000002" },
    { column: "H", value: "", details: ['אתר חו"ל', "הנחה ₪0.60", "הוראת קבע"] },
  ],
  [
    { column: "A", value: "10.07.26" },
    { column: "B", value: "מכולת הדוגמה" },
    { column: "C", value: 1200 },
    { column: "D", value: "₪" },
    { column: "E", value: 400 },
    { column: "F", value: "₪" },
    { column: "G", value: "900000003" },
    { column: "H", value: "", details: ["תשלום 2 מתוך 3"] },
  ],
  [
    { column: "A", value: "05.06.26" },
    { column: "B", value: "ריהוט לדוגמה" },
    { column: "C", value: 900 },
    { column: "D", value: "₪" },
    { column: "E", value: 450 },
    { column: "F", value: "₪" },
    { column: "G", value: "900000004" },
    { column: "H", value: "", details: ["תשלום 2 מתוך 2", "תשלום אחרון"] },
  ],
  // A refund. The real statement inspected had none, so this case is invented from the
  // issuer's documented behaviour and is the least certain part of the fixture.
  [
    { column: "A", value: "03.08.26" },
    { column: "B", value: "חנות הספרים לדוגמה" },
    { column: "C", value: -75.5 },
    { column: "D", value: "₪" },
    { column: "E", value: -75.5 },
    { column: "F", value: "₪" },
    { column: "G", value: "900000005" },
    { column: "H", value: "", details: ["זיכוי"] },
  ],
];

const HEADERS = [
  "תאריך רכישה",
  "שם בית עסק",
  "סכום עסקה",
  "מטבע עסקה",
  "סכום חיוב",
  "מטבע חיוב",
  "מס' שובר",
  "פירוט נוסף",
];

const STATED_TOTAL = "1,021.60";

/**
 * The synthetic values a test may assert against.
 *
 * Tests import these instead of repeating Hebrew literals, which keeps Hebrew inside the
 * approved fixture path and keeps the fixture and its expectations in one place.
 */
export const FIXTURE = {
  cardLabel: "כרטיס לדוגמה",
  cardLastDigits: "1234",
  merchants: {
    bookshop: TRANSACTIONS[0]![1]!.value as string,
    hosting: "EXAMPLE HOSTING",
  },
  references: {
    shekelPurchase: "900000001",
    foreignPurchase: "900000002",
    midInstallment: "900000003",
    finalInstallment: "900000004",
    refund: "900000005",
  },
  foreignTags: TRANSACTIONS[1]![7]!.details!.filter((line) => !line.startsWith("הנחה")),
  statedTotal: STATED_TOTAL,
} as const;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cellXml(reference: string, cell: Cell): string {
  if (cell.details !== undefined) {
    const runs = cell.details
      .map(
        (line, index) =>
          `<x:r><x:t xml:space="preserve">${escapeXml(line)}${index < cell.details!.length - 1 ? "\n" : ""}</x:t></x:r>`,
      )
      .join("");
    return `<x:c r="${reference}" s="2" t="inlineStr"><x:is>${runs}</x:is></x:c>`;
  }
  if (typeof cell.value === "number") {
    return `<x:c r="${reference}" s="4"><x:v>${cell.value}</x:v></x:c>`;
  }
  return `<x:c r="${reference}" s="2" t="str"><x:v>${escapeXml(cell.value)}</x:v></x:c>`;
}

function rowXml(rowNumber: number, cells: readonly Cell[]): string {
  const body = cells
    .filter((cell) => cell.details !== undefined || cell.value !== "")
    .map((cell) => cellXml(`${cell.column}${rowNumber}`, cell))
    .join("");
  return `<x:row r="${rowNumber}">${body}</x:row>`;
}

function build(): Uint8Array {
  const rows: string[] = [];

  rows.push(
    rowXml(2, [
      { column: "A", value: "פירוט עסקאות" },
      { column: "C", value: "אוגוסט 2026" },
    ]),
  );
  // Bidirectional marks around the card label appear in real exports.
  rows.push(
    rowXml(5, [
      { column: "A", value: "‫כרטיס לדוגמה‬ - 1234" },
      { column: "H", value: `₪ ${STATED_TOTAL}` },
    ]),
  );
  rows.push(
    rowXml(6, [
      { column: "A", value: "על שם ישראל ישראלי" },
      { column: "H", value: "לחיוב ב-15.08" },
    ]),
  );
  rows.push(rowXml(9, [{ column: "A", value: "עסקאות למועד חיוב" }]));
  rows.push(
    rowXml(
      10,
      HEADERS.map((header, index) => ({
        column: String.fromCharCode("A".charCodeAt(0) + index),
        value: header,
      })),
    ),
  );

  TRANSACTIONS.forEach((cells, index) => rows.push(rowXml(11 + index, cells)));

  const totalRow = 11 + TRANSACTIONS.length;
  rows.push(
    rowXml(totalRow, [
      { column: "B", value: 'סה"כ לחיוב החודש בכרטיס בש"ח' },
      { column: "E", value: Number(STATED_TOTAL.replace(/,/g, "")) },
      { column: "F", value: "₪" },
    ]),
  );

  const sheet =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<x:sheetViews><x:sheetView rightToLeft="1" workbookViewId="0"/></x:sheetViews>` +
    `<x:sheetData>${rows.join("")}</x:sheetData></x:worksheet>`;

  const workbook =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<x:sheets><x:sheet name="${escapeXml(SHEET_NAME)}" sheetId="1" r:id="R1" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></x:sheets>` +
    `</x:workbook>`;

  const contentTypes =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `</Types>`;

  const rootRels =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="R0" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="/xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbookRels =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="R1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet1.xml"/>` +
    `</Relationships>`;

  return zipSync({
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rootRels),
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRels),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  });
}

export const FIXTURE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "statement-august-2026.xlsx",
);

// Only write when run directly. Tests import FIXTURE for their expectations, and an
// import must not rewrite the file they are reading.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(FIXTURE_PATH, build());
  console.log(`Wrote ${FIXTURE_PATH}`);
}
