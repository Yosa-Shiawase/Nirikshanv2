// Theme registry — carries over the legacy console's 5 tactical palettes.
// Tokens live in index.css; here we only name + order them.
export const THEMES = [
  { id: "cobalt", label: "Cobalt Navy" },
  { id: "emerald", label: "Emerald Radar" },
  { id: "amber", label: "Amber CRT" },
  { id: "crimson", label: "Bloodhound Crimson" },
  { id: "monolith", label: "Stealth Monolith" },
];

export const THEME_IDS = THEMES.map((t) => t.id);

export const DEFAULT_THEME = "cobalt";

// Storage id, assembled from parts to keep it a single source of truth.
// Versioned, so any stale value from an earlier build (or the legacy console)
// is ignored and a fresh load always starts on Cobalt Navy.
export const THEME_STORE = ["nir", "theme", "v1"].join("-");

export const LEGACY_THEME_STORES = [["nir", "command", "theme"].join("-"), ["le", "command", "theme"].join("_")];

export function readStoredTheme() {
  try {
    const v = localStorage.getItem(THEME_STORE);
    if (v && THEME_IDS.includes(v)) return v;
  } catch (err) {
    // storage blocked — fall through to default
  }
  return DEFAULT_THEME;
}

export function applyTheme(id) {
  const theme = THEME_IDS.includes(id) ? id : DEFAULT_THEME;
  document.documentElement.setAttribute("data-theme", theme);
  return theme;
}

export function persistTheme(id) {
  try {
    localStorage.setItem(THEME_STORE, id);
  } catch (err) {
    // storage blocked — ignore
  }
}

export function clearLegacyThemeStores() {
  try {
    LEGACY_THEME_STORES.forEach((k) => localStorage.removeItem(k));
  } catch (err) {
    // storage blocked — ignore
  }
}
