// Defensive API client for the NIRAKSHAN backend (app.py).
// The backend is fixed/battle-tested: never mutate it, only speak its routes.
// All responses are parsed defensively because SSE + legacy payloads vary.

async function jget(url, { timeout = 12000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function jpost(url, body, { timeout = 12000, raw = false } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": raw ? "text/plain" : "application/json" },
      body: raw ? body : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${url} -> ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export const api = {
  /** { ok, clients, ntfy } */
  health: () => jget("/health"),

  /** SMS rule-engine verdict. app.py expects raw "sender|text". */
  smsPlain: (sender, text) => jpost("/sms-plain", `${sender}|${text}`, { raw: true }),

  /** UPI QR forensics verdict. Tries /qr/verify then /api/verify-qr. */
  async qrVerify(uri) {
    try {
      return await jpost("/qr/verify", { uri });
    } catch {
      return await jpost("/api/verify-qr", { uri });
    }
  },

  /** stolen-amount case split across laundering layers. */
  caseTrace: () => jget("/case/trace", { timeout: 20000 }),

  /** { engine, text } AI briefing. */
  aiBriefing: () => jget("/ai/briefing", { timeout: 25000 }),

  /** real ATM/banks near a terminal (OSM Overpass; may be degraded). */
  atms: ({ node, lat, lon, r = 3000 } = {}) => {
    const q = new URLSearchParams();
    if (node) q.set("node", node);
    if (lat != null) q.set("lat", String(lat));
    if (lon != null) q.set("lon", String(lon));
    if (r != null) q.set("r", String(r));
    return jget(`/atms?${q.toString()}`, { timeout: 25000 });
  },

  /** inject a test complaint. */
  ingest: (complaint) => jpost("/ingest", complaint),
};

/** SSE URL for the live feed (proxied in dev, same-origin in prod). */
export const EVENTS_URL = "/events";

export default api;
