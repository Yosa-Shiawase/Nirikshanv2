// Single source of truth for the console's panes (F1–F10 live in these).
// `mobile` marks the four that also appear in the mobile bottom bar.
export const VIEWS = [
  { id: "map", label: "MAP", icon: "◉", desc: "Risk Map · Live Chase", mobile: true },
  { id: "alerts", label: "ALERTS", icon: "⚠", desc: "SMS Threat Sensor", mobile: true },
  { id: "qr", label: "QR", icon: "▣", desc: "UPI Forensics", mobile: true },
  { id: "entities", label: "ENTITIES", icon: "⬡", desc: "Suspect Clusters" },
  { id: "transactions", label: "TXNS", icon: "⇄", desc: "Money Trail DAG" },
  { id: "dashboard", label: "DASHBOARD", icon: "▤", desc: "Command Overview" },
  { id: "reports", label: "REPORTS", icon: "▧", desc: "Case Dossiers" },
  { id: "engine", label: "ENGINE ROOM", icon: "◎", desc: "Prediction Machinery" },
  { id: "system", label: "SYSTEM", icon: "⚙", desc: "Themes · Hawkes", mobile: false },
];

export const MOBILE_VIEW_IDS = VIEWS.filter((v) => v.mobile).map((v) => v.id);

export const MOBILE_PRIMARY = ["map", "alerts", "qr"]; // bottom bar + a MORE tab

export const DEFAULT_VIEW = "map";

export function viewById(id) {
  return VIEWS.find((v) => v.id === id) || VIEWS[0];
}
