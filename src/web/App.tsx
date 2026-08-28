import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  LOCALE_DIRECTION,
  LOCALE_NATIVE_NAME_KEY,
  SUPPORTED_LOCALES,
  isSupportedLocale,
  type SupportedLocale,
} from "../locales/index.ts";
import { readStoredLocale, storeLocale } from "./i18n.ts";
import ImportView from "./ImportView.tsx";
import TransactionsView from "./TransactionsView.tsx";
import {
  isThemePreference,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  type ThemePreference,
} from "./theme.ts";

type HealthState =
  | { kind: "checking" }
  | { kind: "ready"; database: "connected" }
  | { kind: "degraded"; database: "disconnected" }
  | { kind: "unreachable" };

const THEME_LABEL_KEYS: Record<ThemePreference, string> = {
  system: "settings.themeSystem",
  light: "settings.themeLight",
  dark: "settings.themeDark",
};

/** Two views is the whole application for now, so state replaces a router. */
const VIEWS = ["transactions", "import"] as const;

type View = (typeof VIEWS)[number];

const VIEW_LABEL_KEYS: Record<View, string> = {
  transactions: "nav.transactions",
  import: "nav.import",
};

export default function App() {
  const { t, i18n } = useTranslation();
  const [locale, setLocale] = useState<SupportedLocale>(readStoredLocale);
  const [themePreference, setThemePreference] = useState<ThemePreference>(readStoredTheme);
  const [health, setHealth] = useState<HealthState>({ kind: "checking" });
  const [view, setView] = useState<View>("transactions");

  const showImport = useCallback(() => {
    setView("import");
  }, []);

  useEffect(() => {
    void i18n.changeLanguage(locale);
    storeLocale(locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = LOCALE_DIRECTION[locale];
  }, [i18n, locale]);

  useEffect(() => {
    storeTheme(themePreference);
    document.documentElement.dataset.theme = resolveTheme(themePreference);
  }, [themePreference]);

  const fetchHealth = useCallback(async (): Promise<HealthState> => {
    try {
      const response = await fetch("/api/health");
      const body: unknown = await response.json();
      const status =
        typeof body === "object" && body !== null && "status" in body
          ? (body as { status: unknown }).status
          : undefined;
      return status === "ready"
        ? { kind: "ready", database: "connected" }
        : { kind: "degraded", database: "disconnected" };
    } catch {
      return { kind: "unreachable" };
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchHealth().then((next) => {
      if (!cancelled) {
        setHealth(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fetchHealth]);

  const recheckHealth = useCallback(() => {
    setHealth({ kind: "checking" });
    void fetchHealth().then(setHealth);
  }, [fetchHealth]);

  return (
    <main className="app">
      <header className="app__header">
        <h1 className="app__title">{t("app.name")}</h1>
        <p className="app__tagline">{t("app.tagline")}</p>
      </header>

      <nav className="nav" aria-label={t("nav.label")}>
        {VIEWS.map((value) => (
          <button
            key={value}
            type="button"
            className={`nav__item${view === value ? " nav__item--active" : ""}`}
            aria-current={view === value ? "page" : undefined}
            onClick={() => {
              setView(value);
            }}
          >
            {t(VIEW_LABEL_KEYS[value])}
          </button>
        ))}
      </nav>

      {view === "transactions" ? (
        <TransactionsView locale={locale} onImportRequested={showImport} />
      ) : (
        <ImportView locale={locale} />
      )}

      <section className="panel" aria-live="polite">
        <h2 className="panel__heading">{t("status.heading")}</h2>
        <p className={`status status--${health.kind}`}>{t(`status.${health.kind}`)}</p>
        {"database" in health ? (
          <p className="status__detail">
            {t("status.databaseLabel")}
            {": "}
            {t(
              health.database === "connected"
                ? "status.databaseConnected"
                : "status.databaseDisconnected",
            )}
          </p>
        ) : null}
        <button type="button" onClick={recheckHealth}>
          {t("status.retry")}
        </button>
      </section>

      <section className="panel">
        <label className="field">
          <span className="field__label">{t("settings.language")}</span>
          <select
            value={locale}
            onChange={(event) => {
              if (isSupportedLocale(event.target.value)) {
                setLocale(event.target.value);
              }
            }}
          >
            {SUPPORTED_LOCALES.map((value) => (
              <option key={value} value={value}>
                {/* Each option shows its own language's name, not the active language's. */}
                {t(LOCALE_NATIVE_NAME_KEY, { lng: value })}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field__label">{t("settings.theme")}</span>
          <select
            value={themePreference}
            onChange={(event) => {
              if (isThemePreference(event.target.value)) {
                setThemePreference(event.target.value);
              }
            }}
          >
            {(Object.keys(THEME_LABEL_KEYS) as ThemePreference[]).map((value) => (
              <option key={value} value={value}>
                {t(THEME_LABEL_KEYS[value])}
              </option>
            ))}
          </select>
        </label>
      </section>

      <footer className="app__footer">{t("foundation.notice")}</footer>
    </main>
  );
}
