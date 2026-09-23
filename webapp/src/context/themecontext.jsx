import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  THEME_IDS,
  applyTheme,
  clearLegacyThemeStores,
  persistTheme,
  readStoredTheme,
} from "../lib/theme.js";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  // Initial theme: stored explicit choice, else Cobalt Navy.
  const [theme, setThemeState] = useState(() => readStoredTheme());

  // Keep <html data-theme> in sync with state.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Drop any stale keys from earlier builds / the legacy console.
  useEffect(() => {
    clearLegacyThemeStores();
  }, []);

  // Persist only on an explicit user action (not on first paint), so a fresh
  // load always starts on the default.
  const setTheme = useCallback((id) => {
    const next = THEME_IDS.includes(id) ? id : "cobalt";
    setThemeState(next);
    persistTheme(next);
  }, []);

  const cycleTheme = useCallback(() => {
    setThemeState((cur) => {
      const idx = THEME_IDS.indexOf(cur);
      const next = THEME_IDS[(idx + 1) % THEME_IDS.length];
      persistTheme(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, setTheme, cycleTheme }), [theme, setTheme, cycleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

export default ThemeContext;
