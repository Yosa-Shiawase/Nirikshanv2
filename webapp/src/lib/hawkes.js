// Hawkes self-exciting point-process math, shared by the map, dashboard and
// engine room so every surface scores from the SAME numbers (F9 tunables).
//
// Intensity for a terminal at a horizon H:
//   λ(T,H) = Σ_events  α^hop · exp(−β·Δt/σ)  · (1 + H·β/24)
// where Δt is the event age in seconds. β, σ, α are live-tunable.

export const DEFAULT_HAWKES = { beta: 1.38, sigma: 350, alpha: 0.42 };

export const TERMINALS = [
  "DL-01", "MUM-01", "BLR-01", "HYD-01", "LKO-01", "JAI-01",
  "SGR-01", "AMD-01", "IND-01", "CCU-01", "MAA-01",
];

export const TERMINAL_META = {
  "DL-01": { city: "Delhi", zone: "North" },
  "MUM-01": { city: "Mumbai", zone: "West" },
  "BLR-01": { city: "Bengaluru", zone: "South" },
  "HYD-01": { city: "Hyderabad", zone: "South" },
  "LKO-01": { city: "Lucknow", zone: "North" },
  "JAI-01": { city: "Jaipur", zone: "North" },
  "SGR-01": { city: "Srinagar", zone: "North" },
  "AMD-01": { city: "Ahmedabad", zone: "West" },
  "IND-01": { city: "Indore", zone: "Central" },
  "CCU-01": { city: "Kolkata", zone: "East" },
  "MAA-01": { city: "Chennai", zone: "South" },
};

export const HORIZONS = [
  { label: "NOW", hours: 0 },
  { label: "+2h", hours: 2 },
  { label: "+6h", hours: 6 },
  { label: "+24h", hours: 24 },
];

/** α^hop — the money-decay factor used in chase + chain anatomy. */
export function hopDecay(hop, alpha = DEFAULT_HAWKES.alpha) {
  return Math.pow(alpha, Math.max(0, Number(hop) || 0));
}

function ageSeconds(ts, now) {
  if (typeof ts === "number") return Math.max(0, (now - ts) / 1000);
  const m = /^(\d{2}):(\d{2}):(\d{2})$/.exec(String(ts || ""));
  if (!m) return 0;
  const d = new Date(now);
  d.setHours(Number(m[1]), Number(m[2]), Number(m[3]), 0);
  return Math.max(0, (now - d.getTime()) / 1000);
}

/** λ for one terminal. */
export function hawkesIntensity(complaints, terminalId, params = DEFAULT_HAWKES, horizonHours = 0, now = Date.now()) {
  const beta = Number(params.beta) || DEFAULT_HAWKES.beta;
  const sigma = Number(params.sigma) || DEFAULT_HAWKES.sigma;
  const alpha = Number(params.alpha) || DEFAULT_HAWKES.alpha;
  let lam = 0;
  for (const c of complaints) {
    if (!c || c.target_terminal_id !== terminalId) continue;
    const dt = ageSeconds(c.timestamp, now);
    const hop = Number(c.hop_count) || 1;
    lam += hopDecay(hop, alpha) * Math.exp((-beta * dt) / sigma);
  }
  const horizonFactor = 1 + Math.max(0, horizonHours) * (beta / 24);
  return lam * horizonFactor;
}

/** Ranked [{terminal, lambda, share}] for the current window + horizon. */
export function rankTerminals(complaints, params = DEFAULT_HAWKES, horizonHours = 0, now = Date.now()) {
  const rows = TERMINALS.map((t) => {
    const lambda = hawkesIntensity(complaints, t, params, horizonHours, now);
    return { terminal: t, lambda, ...(TERMINAL_META[t] || {}) };
  }).sort((a, b) => b.lambda - a.lambda);
  const max = rows.length ? rows[0].lambda || 1 : 1;
  return rows.map((r) => ({ ...r, share: r.lambda / max }));
}

/** Per-zone aggregate risk (for the dashboard's regional bars). */
export function zoneRisk(complaints, params = DEFAULT_HAWKES, horizonHours = 0, now = Date.now()) {
  const byZone = {};
  const ranked = rankTerminals(complaints, params, horizonHours, now);
  for (const r of ranked) {
    const z = r.zone || "Other";
    byZone[z] = (byZone[z] || 0) + r.lambda;
  }
  const entries = Object.entries(byZone).sort((a, b) => b[1] - a[1]);
  const max = entries.length ? entries[0][1] || 1 : 1;
  return entries.map(([zone, lambda]) => ({ zone, lambda, share: lambda / max }));
}
