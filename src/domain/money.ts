/**
 * Amounts are stored as integer minor units. Floating point is prohibited for financial
 * values: 0.1 + 0.2 is not 0.3, and a statement that fails to reconcile by an agora is
 * indistinguishable from a parser bug.
 */

export const SUPPORTED_CURRENCIES = ["ILS", "USD", "EUR", "GBP"] as const;

export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export type Money = {
  /** Signed amount in minor units, for example agorot for ILS. */
  minorUnits: number;
  currency: Currency;
};

/** Every supported currency happens to use two decimal places. */
const MINOR_UNITS_PER_MAJOR = 100;

export function isCurrency(value: string): value is Currency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

/**
 * Removes the characters that decorate a number in a right-to-left document: spaces,
 * thousands separators, the no-break space, and the left-to-right and right-to-left
 * marks. Listed by code point so the source stays readable and free of invisible
 * characters.
 */
const STRIPPED_CODE_POINTS = new Set([
  0x09, // tab
  0x0a, // line feed
  0x0d, // carriage return
  0x20, // space
  0x2c, // comma
  0xa0, // no-break space
  0x200e, // left-to-right mark
  0x200f, // right-to-left mark
]);

function stripFormatting(value: string): string {
  let result = "";
  for (const character of value) {
    if (!STRIPPED_CODE_POINTS.has(character.codePointAt(0) ?? 0)) result += character;
  }
  return result;
}

/**
 * Parses a decimal amount without going through a float.
 *
 * Accepts an optional sign, thousands separators, and up to two decimal places. A third
 * decimal place is rejected rather than rounded: silently losing a fraction of a unit is
 * how reconciliation errors start.
 */
export function parseAmount(input: string, currency: Currency): Money {
  const normalised = stripFormatting(input);
  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(normalised);
  if (match === null) {
    throw new Error(`Unrecognised amount: ${JSON.stringify(input)}`);
  }

  const [, sign, whole, fraction = ""] = match;
  const minor = Number.parseInt((fraction + "00").slice(0, 2), 10);
  const magnitude = Number.parseInt(whole ?? "0", 10) * MINOR_UNITS_PER_MAJOR + minor;

  if (!Number.isSafeInteger(magnitude)) {
    throw new Error(`Amount is out of range: ${JSON.stringify(input)}`);
  }

  return { minorUnits: sign === "-" ? -magnitude : magnitude, currency };
}

export function formatAmount({ minorUnits, currency }: Money): string {
  const sign = minorUnits < 0 ? "-" : "";
  const magnitude = Math.abs(minorUnits);
  const whole = Math.trunc(magnitude / MINOR_UNITS_PER_MAJOR);
  const fraction = String(magnitude % MINOR_UNITS_PER_MAJOR).padStart(2, "0");
  return `${sign}${whole}.${fraction} ${currency}`;
}

export function addAmounts(amounts: readonly Money[], currency: Currency): Money {
  let total = 0;
  for (const amount of amounts) {
    if (amount.currency !== currency) {
      throw new Error(`Cannot add ${amount.currency} to a ${currency} total.`);
    }
    total += amount.minorUnits;
  }
  return { minorUnits: total, currency };
}

export function amountsEqual(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.minorUnits === b.minorUnits;
}
