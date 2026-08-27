export const THEME_PREFERENCES = ["system", "light", "dark"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

const STORAGE_KEY = "pirut.theme";

export function isThemePreference(value: string): value is ThemePreference {
  return (THEME_PREFERENCES as readonly string[]).includes(value);
}

export function readStoredTheme(): ThemePreference {
  const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
  return stored !== null && stored !== undefined && isThemePreference(stored) ? stored : "system";
}

export function storeTheme(preference: ThemePreference): void {
  globalThis.localStorage?.setItem(STORAGE_KEY, preference);
}

export function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference !== "system") {
    return preference;
  }
  return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
