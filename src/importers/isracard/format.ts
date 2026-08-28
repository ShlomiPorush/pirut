/**
 * The vocabulary of the Isracard export format.
 *
 * This is the one module in `src/` outside the locale catalogs that may contain Hebrew,
 * and the language guard allows this exact path. The strings here are not user-facing
 * text: they are tokens the issuer writes into the file, no more translatable than a
 * column name in a CSV. A statement cannot be parsed without matching them literally.
 *
 * Nothing here may be shown to a user. Anything a person reads belongs in `src/locales/`.
 */

/** Column headers of the transactions table, in the order the issuer writes them. */
export const HEADERS = {
  purchaseDate: "תאריך רכישה",
  merchant: "שם בית עסק",
  originalAmount: "סכום עסקה",
  originalCurrency: "מטבע עסקה",
  billedAmount: "סכום חיוב",
  billedCurrency: "מטבע חיוב",
  reference: "מס' שובר",
  details: "פירוט נוסף",
} as const;

/** The issuer writes currency symbols rather than ISO codes. */
export const CURRENCY_SYMBOLS = {
  "₪": "ILS",
  'ש"ח': "ILS",
  $: "USD",
  "€": "EUR",
  "£": "GBP",
} as const;

/** Month names as they appear in the statement period, ordered from January. */
export const MONTH_NAMES = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
] as const;

/** Markers the issuer stacks in the details column, one per line. */
export const MARKERS = {
  /** "payment N of M" */
  installment: /^תשלום\s+(\d+)\s+מתוך\s+(\d+)$/,
  finalInstallment: "תשלום אחרון",
  /** "discount <amount>" */
  discount: /^הנחה\s*(.+)$/,
} as const;

/** "charged on DD.MM", stated once for the whole statement. */
export const CHARGE_DATE = /^לחיוב\s+ב-?\s*(\d{1,2})\.(\d{1,2})$/;
