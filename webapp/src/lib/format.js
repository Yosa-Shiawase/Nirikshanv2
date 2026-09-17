// Small formatting helpers shared across panes.

export function fmtINR(n) {
  const v = Number(n);
  if (!isFinite(v)) return "—";
  return "₹" + v.toLocaleString("en-IN");
}

export function fmtCompactINR(n) {
  const v = Number(n);
  if (!isFinite(v)) return "—";
  if (v >= 10000000) return "₹" + (v / 10000000).toFixed(2) + " Cr";
  if (v >= 100000) return "₹" + (v / 100000).toFixed(2) + " L";
  if (v >= 1000) return "₹" + (v / 1000).toFixed(1) + "k";
  return "₹" + v;
}

/** "HH:MM:SS" (backend clock) -> epoch ms today. Falls back to now. */
export function parseClock(ts, now = new Date()) {
  if (typeof ts === "number") return ts;
  const m = /^(\d{2}):(\d{2}):(\d{2})$/.exec(String(ts || ""));
  if (!m) return now.getTime();
  const d = new Date(now);
  d.setHours(Number(m[1]), Number(m[2]), Number(m[3]), 0);
  return d.getTime();
}

export function secondsAgo(ts, now = Date.now()) {
  const t = parseClock(ts);
  return Math.max(0, Math.round((now - t) / 1000));
}

export function pct(part, whole) {
  if (!whole) return 0;
  return Math.max(0, Math.min(100, Math.round((part / whole) * 100)));
}

export function riskTone(score) {
  const s = Number(score) || 0;
  if (s >= 45) return "var(--danger)";
  if (s >= 20) return "var(--warn)";
  return "var(--ok)";
}
