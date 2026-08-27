export const SUPPORTED_LOCALES = ["he", "en"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "he";

export const LOCALE_DIRECTION: Record<SupportedLocale, "rtl" | "ltr"> = {
  he: "rtl",
  en: "ltr",
};

export const LOCALE_NATIVE_NAME: Record<SupportedLocale, string> = {
  he: "עברית",
  en: "English",
};

export function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
