import { describe, expect, it } from "vitest";
import en from "../../src/locales/en/common.json" with { type: "json" };
import he from "../../src/locales/he/common.json" with { type: "json" };
import { DEFAULT_LOCALE, LOCALE_DIRECTION, SUPPORTED_LOCALES } from "../../src/locales/index.ts";

// Escapes rather than literal characters, so this file stays free of Hebrew itself.
const HEBREW_BLOCK = /[\u0590-\u05FF]/;

type Catalog = Record<string, unknown>;

function flatten(value: Catalog, prefix = ""): Map<string, unknown> {
  const entries = new Map<string, unknown>();
  for (const [key, child] of Object.entries(value)) {
    const fullKey = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof child === "object" && child !== null && !Array.isArray(child)) {
      for (const [nestedKey, nestedValue] of flatten(child as Catalog, fullKey)) {
        entries.set(nestedKey, nestedValue);
      }
    } else {
      entries.set(fullKey, child);
    }
  }
  return entries;
}

const englishKeys = flatten(en);
const hebrewKeys = flatten(he);

describe("locale catalogs", () => {
  it("declares Hebrew as the default locale with right-to-left direction", () => {
    expect(DEFAULT_LOCALE).toBe("he");
    expect(LOCALE_DIRECTION.he).toBe("rtl");
    expect(LOCALE_DIRECTION.en).toBe("ltr");
    expect([...SUPPORTED_LOCALES]).toEqual(["he", "en"]);
  });

  it("keeps the English and Hebrew key sets identical", () => {
    expect([...hebrewKeys.keys()].sort()).toEqual([...englishKeys.keys()].sort());
  });

  it("has a non-empty string for every key in both catalogs", () => {
    for (const [catalogName, catalog] of [
      ["en", englishKeys],
      ["he", hebrewKeys],
    ] as const) {
      for (const [key, value] of catalog) {
        expect(typeof value, `${catalogName}.${key}`).toBe("string");
        expect((value as string).trim(), `${catalogName}.${key}`).not.toBe("");
      }
    }
  });

  it("keeps the English catalog free of Hebrew characters", () => {
    for (const [key, value] of englishKeys) {
      expect(HEBREW_BLOCK.test(String(value)), `en.${key}`).toBe(false);
    }
  });

  it("provides each locale's own name in its own catalog", () => {
    expect(HEBREW_BLOCK.test(String(hebrewKeys.get("language.native")))).toBe(true);
    expect(englishKeys.get("language.native")).toBe("English");
  });
});
