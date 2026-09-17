// Hawkes scoring, shared by the map, dashboard, engine room and case card.
//
// Two complementary views:
//  1. evaluateTerminal()  — the legacy console's forecast engine (base metrics
//     + spatial/temporal kernel across hot terminals). Drives the MAP score,
//     the risk colours and the horizon slider. This is the "same math as the
//     ENGINE ROOM ranking".
//  2. hawkesIntensity()   — a live-excitation intensity over the SSE stream,
//     used for the dashboard's live λ.
import { NODES } from "./terminals";

export const DEFAULT_HAWKES = { beta: 1.38, sigma: 350, alpha: 0.42 };

export const TERMINALS = NODES.map((n) => n.id);

export const TERMINAL_META = NODES.reduce((acc, n) => {
  acc[n.id] = { city: n.city, zone: n.zone };
  return acc;
}, {});

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

/** Great-circle distance in km. */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Legacy forecast engine — verbatim formula (public/app.js evaluateNodeIntensity). */
export function evaluateTerminal(node, forecastHorizon = 0, params = DEFAULT_HAWKES) {
  const beta = Number(params.beta) || 1.38;
  const sigmaKm = Number(params.sigma) || 350;
  const alphaDecay = Number(params.alpha) || 0.42;

  const hopFactor = Math.pow(alphaDecay, node.baseHops || 2);
  let lambda = (node.baseScore / 100.0) * hopFactor * 0.45;

  NODES.filter((n) => n.id !== node.id && n.baseScore >= 70).forEach((other) => {
    const deltaT = forecastHorizon + 0.5;
    const temporalKernel = Math.exp(-beta * deltaT);
    const dist = haversineKm(node.lat, node.lon, other.lat, other.lon);
    const spatialKernel = Math.exp(-(dist * dist) / (2 * sigmaKm * sigmaKm));
    const markWeight = Math.log1p((other.baseFlow || 100000) / 10000.0);
    lambda += markWeight * temporalKernel * spatialKernel;
  });

  const prob = 1.0 - Math.exp(-lambda * Math.max(1.0, forecastHorizon * 0.5));
  const dynamicScore = Math.min(99, Math.max(12, Math.round(prob * 100)));
  const projectedFlow = Math.round(node.baseFlow * (prob / (node.baseScore / 100.0)));

  return {
    intensity: lambda.toFixed(3),
    probability: prob.toFixed(3),
    score: dynamicScore,
    projectedFlow,
  };
}

/** Risk colour ramp (matches the brief's thresholds). */
export function riskColor(score) {
  const s = Number(score) || 0;
  if (s >= 80) return "#ef4444";
  if (s >= 65) return "#f97316";
  if (s >= 40) return "#eab308";
  if (s >= 25) return "#06b6d4";
  return "#10b981";
}

/** Scored terminals for a horizon, ranked by score desc. */
export function scoreAll(horizonHours = 0, params = DEFAULT_HAWKES) {
  return NODES.map((n) => ({ node: n, ...evaluateTerminal(n, horizonHours, params) })).sort(
    (a, b) => b.score - a.score
  );
}

/* ---------- live-excitation view (dashboard) ---------- */

function ageSeconds(ts, now) {
  if (typeof ts === "number") return Math.max(0, (now - ts) / 1000);
  const m = /^(\d{2}):(\d{2}):(\d{2})$/.exec(String(ts || ""));
  if (!m) return 0;
  const d = new Date(now);
  d.setHours(Number(m[1]), Number(m[2]), Number(m[3]), 0);
  return Math.max(0, (now - d.getTime()) / 1000);
}

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

export function rankTerminals(complaints, params = DEFAULT_HAWKES, horizonHours = 0, now = Date.now()) {
  const rows = TERMINALS.map((t) => {
    const lambda = hawkesIntensity(complaints, t, params, horizonHours, now);
    return { terminal: t, lambda, ...(TERMINAL_META[t] || {}) };
  }).sort((a, b) => b.lambda - a.lambda);
  const max = rows.length ? rows[0].lambda || 1 : 1;
  return rows.map((r) => ({ ...r, share: r.lambda / max }));
}

export function zoneRisk(complaints, params = DEFAULT_HAWKES, horizonHours = 0, now = Date.now()) {
  const byZone = {};
  for (const r of rankTerminals(complaints, params, horizonHours, now)) {
    const z = r.zone || "Other";
    byZone[z] = (byZone[z] || 0) + r.lambda;
  }
  const entries = Object.entries(byZone).sort((a, b) => b[1] - a[1]);
  const max = entries.length ? entries[0][1] || 1 : 1;
  return entries.map(([zone, lambda]) => ({ zone, lambda, share: lambda / max }));
}
