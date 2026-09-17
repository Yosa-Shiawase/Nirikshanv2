import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { THEME_IDS, applyTheme, persistTheme, readStoredTheme } from "../lib/theme";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => readStoredTheme());

  // Keep <html data-theme> in sync with state.
  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  const setTheme = useCallback((id) => setThemeState(id), []);

  const cycleTheme = useCallback(() => {
    setThemeState((cur) => {
      const idx = THEME_IDS.indexOf(cur);
      return THEME_IDS[(idx + 1) % THEME_IDS.length];
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
