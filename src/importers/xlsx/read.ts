import { unzipSync, strFromU8 } from "fflate";

/**
 * A deliberately narrow SpreadsheetML reader.
 *
 * A general spreadsheet library was tried first and could not open the Isracard export at
 * all. The file is valid OOXML but does not look like Excel's output: every element carries
 * an `x:` namespace prefix, there is no `sharedStrings.xml`, and the core properties sit
 * outside `docProps/`. Element names are therefore matched with an optional prefix.
 *
 * Issuer exports are machine-generated and only loosely resemble what Excel writes, so this
 * reads the few parts that matter and refuses anything it does not recognise rather than
 * guessing at a financial value.
 *
 * Values are returned exactly as the file stores them. Interpreting them is the importer's
 * job, because the meaning of a column depends on the issuer.
 */

export type CellValue = { kind: "text"; text: string } | { kind: "number"; raw: string };

export type SheetRow = Map<string, CellValue>;

export type Sheet = {
  name: string;
  /** Rows keyed by their 1-based spreadsheet row number, as stored in the file. */
  rows: Map<number, SheetRow>;
};

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeXmlText(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    }
    return XML_ENTITIES[entity] ?? match;
  });
}

/** Concatenates every `<t>` run, which is how rich text and inline strings store their text. */
function textRuns(fragment: string): string {
  let text = "";
  for (const match of fragment.matchAll(
    /<(?:[\w.-]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?t>|<(?:[\w.-]+:)?t(?:\s[^>]*)?\/>/g,
  )) {
    text += decodeXmlText(match[1] ?? "");
  }
  return text;
}

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return match?.[1] === undefined ? undefined : decodeXmlText(match[1]);
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (xml === undefined) return [];
  return [
    ...xml.matchAll(
      /<(?:[\w.-]+:)?si(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?si>|<(?:[\w.-]+:)?si(?:\s[^>]*)?\/>/g,
    ),
  ].map((match) => textRuns(match[1] ?? ""));
}

function columnOf(reference: string): string {
  const match = /^([A-Z]+)/.exec(reference);
  if (match?.[1] === undefined) {
    throw new Error(`Unrecognised cell reference: ${reference}`);
  }
  return match[1];
}

function parseSheet(xml: string, sharedStrings: string[]): Map<number, SheetRow> {
  const rows = new Map<number, SheetRow>();

  for (const rowMatch of xml.matchAll(
    /<(?:[\w.-]+:)?row(\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?row>/g,
  )) {
    const rowNumberText = attribute(rowMatch[1] ?? "", "r");
    if (rowNumberText === undefined) continue;
    const rowNumber = Number.parseInt(rowNumberText, 10);
    const cells: SheetRow = new Map();

    const cellPattern = /<(?:[\w.-]+:)?c(\s[^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?c>)/g;
    for (const cellMatch of rowMatch[2]?.matchAll(cellPattern) ?? []) {
      const attributes = cellMatch[1] ?? "";
      const body = cellMatch[2] ?? "";
      const reference = attribute(attributes, "r");
      if (reference === undefined) continue;
      const type = attribute(attributes, "t");

      let value: CellValue | undefined;
      if (type === "inlineStr") {
        value = { kind: "text", text: textRuns(body) };
      } else if (type === "s") {
        const index = Number.parseInt(
          /<(?:[\w.-]+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?v>/.exec(body)?.[1] ?? "",
          10,
        );
        const text = sharedStrings[index];
        if (text === undefined) {
          throw new Error(`Cell ${reference} references missing shared string ${index}`);
        }
        value = { kind: "text", text };
      } else if (type === "str") {
        value = {
          kind: "text",
          text: decodeXmlText(
            /<(?:[\w.-]+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?v>/.exec(body)?.[1] ?? "",
          ),
        };
      } else if (type === undefined || type === "n") {
        const raw = /<(?:[\w.-]+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?v>/.exec(body)?.[1];
        if (raw !== undefined) value = { kind: "number", raw: decodeXmlText(raw) };
      } else {
        // Booleans, errors, and formula shapes are not expected in an issuer export.
        // Failing here is safer than silently dropping a financial value.
        throw new Error(`Cell ${reference} has unsupported type "${type}"`);
      }

      if (value !== undefined && !(value.kind === "text" && value.text === "")) {
        cells.set(columnOf(reference), value);
      }
    }

    if (cells.size > 0) rows.set(rowNumber, cells);
  }

  return rows;
}

export function readFirstSheet(file: Uint8Array): Sheet {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(file);
  } catch {
    throw new Error("The file is not a readable spreadsheet.");
  }

  const workbookXml = entries["xl/workbook.xml"];
  if (workbookXml === undefined) {
    throw new Error("The file is not a spreadsheet: xl/workbook.xml is missing.");
  }

  const firstSheetTag = /<(?:[\w.-]+:)?sheet(\s[^>]*?)\/?>/.exec(strFromU8(workbookXml));
  const name = attribute(firstSheetTag?.[1] ?? "", "name");
  if (name === undefined) {
    throw new Error("The spreadsheet declares no sheets.");
  }

  // Issuer exports have exactly one sheet, always the first worksheet part.
  const sheetEntry =
    entries["xl/worksheets/sheet1.xml"] ??
    Object.entries(entries).find(([path]) => path.startsWith("xl/worksheets/"))?.[1];
  if (sheetEntry === undefined) {
    throw new Error("The spreadsheet contains no worksheet.");
  }

  const sharedStringsEntry = entries["xl/sharedStrings.xml"];
  const sharedStrings = parseSharedStrings(
    sharedStringsEntry === undefined ? undefined : strFromU8(sharedStringsEntry),
  );

  return { name, rows: parseSheet(strFromU8(sheetEntry), sharedStrings) };
}
