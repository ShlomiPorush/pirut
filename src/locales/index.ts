export const SUPPORTED_LOCALES = ["he", "en"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "he";

export const LOCALE_DIRECTION: Record<SupportedLocale, "rtl" | "ltr"> = {
  he: "rtl",
  en: "ltr",
};

// Each locale's own name lives in its catalog under `language.native`, so this module
// stays free of Hebrew and the public-ready language guard has nothing to flag here.
export const LOCALE_NATIVE_NAME_KEY = "language.native";

export function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
