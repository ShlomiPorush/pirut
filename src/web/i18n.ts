import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../locales/en/common.json" with { type: "json" };
import he from "../locales/he/common.json" with { type: "json" };
import { DEFAULT_LOCALE, isSupportedLocale, type SupportedLocale } from "../locales/index.ts";

const STORAGE_KEY = "pirut.locale";

export function readStoredLocale(): SupportedLocale {
  const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
  return stored !== null && stored !== undefined && isSupportedLocale(stored)
    ? stored
    : DEFAULT_LOCALE;
}

export function storeLocale(locale: SupportedLocale): void {
  globalThis.localStorage?.setItem(STORAGE_KEY, locale);
}

await i18n.use(initReactI18next).init({
  resources: {
    en: { common: en },
    he: { common: he },
  },
  lng: readStoredLocale(),
  fallbackLng: DEFAULT_LOCALE,
  defaultNS: "common",
  interpolation: { escapeValue: false },
});

export default i18n;
