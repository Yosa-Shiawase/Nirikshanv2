// Single source of truth for the console's panes.
// Labels are judge-facing (plain language); ids stay technical internally.
export const VIEWS = [
  { id: "map", label: "MAP", icon: "◉", desc: "Live crime map", mobile: true },
  { id: "alerts", label: "ALERTS", icon: "⚠", desc: "SMS scam detector", mobile: true },
  { id: "qr", label: "QR", icon: "▣", desc: "QR scam check", mobile: true },
  { id: "entities", label: "SUSPECTS", icon: "⬡", desc: "Who moves the money" },
  { id: "transactions", label: "TRAIL", icon: "⇄", desc: "How the money moves" },
  { id: "dashboard", label: "DASHBOARD", icon: "▤", desc: "Live complaint feed" },
  { id: "reports", label: "REPORTS", icon: "▧", desc: "Case files" },
  { id: "engine", label: "ENGINE ROOM", icon: "◎", desc: "How predictions are made" },
  { id: "system", label: "SYSTEM", icon: "⚙", desc: "Themes · tuning", mobile: false },
];

export const MOBILE_VIEW_IDS = VIEWS.filter((v) => v.mobile).map((v) => v.id);

export const MOBILE_PRIMARY = ["map", "alerts", "qr"]; // bottom bar + a MORE tab

export const DEFAULT_VIEW = "map";

export function viewById(id) {
  return VIEWS.find((v) => v.id === id) || VIEWS[0];
}
