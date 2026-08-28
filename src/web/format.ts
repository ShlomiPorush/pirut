import type { Currency } from "../domain/money.ts";

/**
 * Display formatting only.
 *
 * Amounts travel and are compared as integer minor units. The division below is the single
 * boundary where a value becomes a float, and its result is never fed back into a
 * calculation.
 */
const MINOR_UNITS_PER_MAJOR = 100;

export function formatMoney(locale: string, minorUnits: number, currency: Currency): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    minorUnits / MINOR_UNITS_PER_MAJOR,
  );
}

/** A calendar date as the API sends it: `YYYY-MM-DD`, or the parsed parts of one. */
export type DateValue = string | { year: number; month: number; day: number };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Builds a local `Date` from calendar parts.
 *
 * `Date.parse("2026-08-01")` is read as UTC midnight and then rendered in the viewer's zone,
 * which shows the previous day west of Greenwich. Constructing from parts keeps the day the
 * statement stated.
 */
function toLocalDate(value: DateValue): Date | null {
  if (typeof value !== "string") {
    return new Date(value.year, value.month - 1, value.day);
  }
  const match = ISO_DATE.exec(value);
  if (match === null) {
    return null;
  }
  const [, year = "", month = "", day = ""] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

export function formatDate(locale: string, value: DateValue): string {
  const date = toLocalDate(value);
  if (date === null) {
    return typeof value === "string" ? value : "";
  }
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

const ISO_MONTH = /^(\d{4})-(\d{2})$/;

/** Splits a `YYYY-MM` charge month into the numbers the transactions filter expects. */
export function parseMonthKey(monthKey: string): { year: number; month: number } | null {
  const match = ISO_MONTH.exec(monthKey);
  if (match === null) {
    return null;
  }
  const [, year = "", month = ""] = match;
  return { year: Number(year), month: Number(month) };
}

export function formatMonth(locale: string, monthKey: string): string {
  const parts = parseMonthKey(monthKey);
  if (parts === null) {
    return monthKey;
  }
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(
    new Date(parts.year, parts.month - 1, 1),
  );
}
