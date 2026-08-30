import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AuthStatus, AuthUser } from "../application/auth-contracts.ts";
import {
  LOCALE_DIRECTION,
  LOCALE_NATIVE_NAME_KEY,
  SUPPORTED_LOCALES,
  isSupportedLocale,
  type SupportedLocale,
} from "../locales/index.ts";
import { fetchAuthStatus, onUnauthorized, type ApiResult } from "./api.ts";
import { signOut } from "./auth-client.ts";
import { readStoredLocale, storeLocale } from "./i18n.ts";
import ImportView from "./ImportView.tsx";
import InsightsView from "./InsightsView.tsx";
import LoginView from "./LoginView.tsx";
import SettingsView from "./SettingsView.tsx";
import SetupView from "./SetupView.tsx";
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

/** Which of the three shells the interface is in. Decided by `/api/setup/status`. */
type Session =
  | { kind: "loading" }
  | { kind: "setup" }
  | { kind: "signedOut" }
  | { kind: "signedIn"; user: AuthUser };

const THEME_LABEL_KEYS: Record<ThemePreference, string> = {
  system: "settings.themeSystem",
  light: "settings.themeLight",
  dark: "settings.themeDark",
};

/** Four views is the whole application for now, so state replaces a router. */
const VIEWS = ["insights", "transactions", "import", "settings"] as const;

type View = (typeof VIEWS)[number];

const VIEW_LABEL_KEYS: Record<View, string> = {
  insights: "nav.insights",
  transactions: "nav.transactions",
  import: "nav.import",
  settings: "nav.settings",
};

/** An unreadable status leaves nothing to show but the sign-in form. */
function readSession(result: ApiResult<AuthStatus>): Session {
  if (!result.ok) {
    return { kind: "signedOut" };
  }
  if (result.value.needsFirstUser) {
    return { kind: "setup" };
  }
  const user = result.value.user;
  return user === null ? { kind: "signedOut" } : { kind: "signedIn", user };
}

export default function App() {
  const { t, i18n } = useTranslation();
  const [locale, setLocale] = useState<SupportedLocale>(readStoredLocale);
  const [themePreference, setThemePreference] = useState<ThemePreference>(readStoredTheme);
  const [health, setHealth] = useState<HealthState>({ kind: "checking" });
  const [view, setView] = useState<View>("insights");
  const [session, setSession] = useState<Session>({ kind: "loading" });

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

  const loadSession = useCallback(async () => {
    setSession(readSession(await fetchAuthStatus()));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchAuthStatus().then((result) => {
      if (!cancelled) {
        setSession(readSession(result));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // A session can end at any moment. Whichever call notices sends the whole shell back to
  // sign-in, so no screen is left showing data it can no longer refresh.
  useEffect(
    () =>
      onUnauthorized(() => {
        setSession({ kind: "signedOut" });
        setView("insights");
      }),
    [],
  );

  const handleSignOut = useCallback(() => {
    void signOut().then(() => {
      setSession({ kind: "signedOut" });
      setView("insights");
    });
  }, []);

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

  const signedIn = session.kind === "signedIn";

  return (
    <main className="app">
      <header className="app__header">
        <h1 className="app__title">{t("app.name")}</h1>
        <p className="app__tagline">{t("app.tagline")}</p>
        {session.kind === "signedIn" ? (
          <div className="account">
            <span className="account__name">
              {t("auth.signedInAs", { name: session.user.name })}
            </span>
            <button type="button" className="button--quiet" onClick={handleSignOut}>
              {t("auth.signOut")}
            </button>
          </div>
        ) : null}
      </header>

      {signedIn ? (
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
      ) : null}

      {session.kind === "setup" ? <SetupView onCompleted={loadSession} /> : null}
      {session.kind === "signedOut" ? <LoginView onSignedIn={loadSession} /> : null}

      {signedIn && view === "transactions" ? (
        <TransactionsView locale={locale} onImportRequested={showImport} />
      ) : null}
      {signedIn && view === "insights" ? (
        <InsightsView locale={locale} onImportRequested={showImport} />
      ) : null}
      {signedIn && view === "import" ? <ImportView locale={locale} /> : null}
      {signedIn && view === "settings" ? <SettingsView locale={locale} /> : null}

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
