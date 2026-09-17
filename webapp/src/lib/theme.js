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

export const THEME_STORAGE_KEY = "nir-command-theme";

export function readStoredTheme() {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v && THEME_IDS.includes(v)) return v;
  } catch (err) {
    // storage blocked — fall through to default
  }
  return "cobalt";
}

export function applyTheme(id) {
  const theme = THEME_IDS.includes(id) ? id : "cobalt";
  document.documentElement.setAttribute("data-theme", theme);
  return theme;
}

export function persistTheme(id) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch (err) {
    // storage blocked — ignore
  }
}
