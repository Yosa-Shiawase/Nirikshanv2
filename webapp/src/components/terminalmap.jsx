import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./TerminalMap.css";
import { useLiveFeed } from "../live/useLiveFeed";
import { useConsole } from "../context/ConsoleContext";
import { useTheme } from "../context/ThemeContext";
import api from "../lib/api";
import {
  BASEMAPS,
  CHASE_SEQ,
  INDIA_CENTER,
  INDIA_ZOOM,
  LABELS_URL,
  NODE_BY_ID,
  NODES,
  TERRAIN_URL,
} from "../lib/terminals";
import { evaluateTerminal, riskColor } from "../lib/hawkes";
import { clockNow } from "../lib/format";
const HORIZONS = [
  { label: "NOW", hours: 0 },
  { label: "+2h", hours: 2 },
  { label: "+6h", hours: 6 },
  { label: "+24h", hours: 24 },
];

function fmtL(inr) {
  return "₹" + (Number(inr) / 100000).toFixed(2) + "L";
}

export default function TerminalMap() {
  const { complaints, anomalies } = useLiveFeed();
  const { selectedNode, setSelectedNode, horizonHours, setHorizonHours } = useConsole();
  const { theme } = useTheme();

  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const baseRef = useRef(null);
  const labelsRef = useRef(null);
  const terrainRef = useRef(null);
  const groups = useRef({});
  const pulseTimers = useRef([]);
  const chaseTimers = useRef([]);
  const seenComplaints = useRef(new Set());
  const toastSeq = useRef(0);

  const [basemap, setBasemap] = useState("dark");
  const pickedBasemap = useRef(false);
  const [labelsOn, setLabelsOn] = useState(false);
  const [terrainOn, setTerrainOn] = useState(false);
  const [chaseRunning, setChaseRunning] = useState(false);
  const [chaseLog, setChaseLog] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [atmState, setAtmState] = useState({ loading: false, count: 0, note: "" });

  const addToast = useCallback((msg, bad) => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t, { id, msg, bad }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  const logLine = useCallback((msg, color) => {
    const t = clockNow();
    setChaseLog((l) => [{ t, msg, color: color || "#bae6fd" }, ...l]);
  }, []);

  /* ---------------- map init ---------------- */
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return undefined;
    const map = L.map(mapEl.current, { zoomControl: true, attributionControl: true }).setView(
      INDIA_CENTER,
      INDIA_ZOOM
    );
    mapRef.current = map;

    baseRef.current = L.tileLayer(BASEMAPS.dark.url, { maxZoom: BASEMAPS.dark.maxZoom, attribution: "ESRI" }).addTo(map);

    groups.current.markers = L.layerGroup().addTo(map);
    groups.current.selection = L.layerGroup().addTo(map);
    groups.current.pulses = L.layerGroup().addTo(map);
    groups.current.atms = L.layerGroup().addTo(map);
    groups.current.chase = L.layerGroup().addTo(map);

    L.control.scale({ imperial: false, position: "bottomright" }).addTo(map);

    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(mapEl.current);
    setTimeout(() => map.invalidateSize(), 120);

    return () => {
      ro.disconnect();
      chaseTimers.current.forEach(clearTimeout);
      pulseTimers.current.forEach(clearInterval);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  /* ---------------- markers + scoring ---------------- */
  const renderMarkers = useCallback(() => {
    const g = groups.current.markers;
    if (!g) return;
    g.clearLayers();
    NODES.forEach((n) => {
      const m = evaluateTerminal(n, horizonHours);
      const c = riskColor(m.score);
      const isP0 = m.score >= 80;
      const radius = (isP0 ? 9 : 6) + Math.min(4, horizonHours * 0.15);

      if (isP0) {
        const icon = L.divIcon({
          className: "risk-pulse",
          html: `<span style="border-color:${c};box-shadow:0 0 12px ${c}"></span>`,
          iconSize: [0, 0],
        });
        L.marker([n.lat, n.lon], { icon, interactive: false, keyboard: false }).addTo(g);
      }

      const glyph = L.circleMarker([n.lat, n.lon], {
        radius,
        fillColor: c,
        color: "#ffffff",
        weight: isP0 ? 2 : 1.5,
        opacity: 0.95,
        fillOpacity: 0.9,
      }).addTo(g);

      glyph.bindTooltip(
        `<b>${n.name}</b><br>Score: ${m.score} | Flow: ₹${m.projectedFlow.toLocaleString("en-IN")}`,
        { className: "nir-tip" }
      );
      glyph.on("click", () => setSelectedNode(n.id));
    });

    // test hook: lets the smoke test read marker count + per-node scores
    if (mapEl.current) {
      mapEl.current.dataset.markerCount = String(NODES.length);
      mapEl.current.dataset.horizon = String(horizonHours);
      mapEl.current.dataset.scores = JSON.stringify(
        NODES.map((n) => ({ id: n.id, score: evaluateTerminal(n, horizonHours).score }))
      );
    }
  }, [horizonHours, setSelectedNode]);

  useEffect(() => {
    renderMarkers();
  }, [renderMarkers]);

  /* selection highlight */
  useEffect(() => {
    const sel = groups.current.selection;
    if (!sel) return;
    sel.clearLayers();
    const n = NODE_BY_ID[selectedNode];
    if (!n) return;
    L.circleMarker([n.lat, n.lon], {
      radius: 15,
      color: "#22d3ee",
      weight: 2,
      fill: false,
      opacity: 0.9,
      dashArray: "4 4",
    }).addTo(sel);
  }, [selectedNode]);

  /* ---------------- live pulses ---------------- */
  const spawnPulse = useCallback((nodeId, color) => {
    const n = NODE_BY_ID[nodeId];
    const g = groups.current.pulses;
    if (!n || !g) return;
    let r = 6;
    const circle = L.circleMarker([n.lat, n.lon], {
      radius: r,
      color,
      weight: 2,
      opacity: 0.85,
      fillColor: color,
      fillOpacity: 0.12,
    }).addTo(g);
    const iv = setInterval(() => {
      r += 2.4;
      circle.setRadius(r);
      circle.setStyle({ opacity: Math.max(0, 0.85 - r / 34) });
      if (r > 30) {
        clearInterval(iv);
        g.removeLayer(circle);
        pulseTimers.current = pulseTimers.current.filter((x) => x !== iv);
      }
    }, 45);
    pulseTimers.current.push(iv);
  }, []);

  useEffect(() => {
    const fresh = complaints.filter((c) => c && c.ack_no && !seenComplaints.current.has(c.ack_no));
    if (!fresh.length) return;
    fresh.slice(0, 6).forEach((c) => {
      seenComplaints.current.add(c.ack_no);
      spawnPulse(c.target_terminal_id, "#38bdf8");
    });
    if (seenComplaints.current.size > 400) {
      seenComplaints.current = new Set(Array.from(seenComplaints.current).slice(-200));
    }
  }, [complaints, spawnPulse]);

  useEffect(() => {
    const latest = anomalies[0];
    if (!latest) return;
    spawnPulse(latest.terminal_id, "#ef4444");
  }, [anomalies, spawnPulse]);

  /* the light palette is unreadable over the dark tiles: default to streets
     until the operator picks a basemap explicitly. */
  useEffect(() => {
    if (pickedBasemap.current) return;
    setBasemap(theme === "light" ? "streets" : "dark");
  }, [theme]);

  /* ---------------- basemap / labels / terrain ---------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (baseRef.current) map.removeLayer(baseRef.current);
    const b = BASEMAPS[basemap];
    baseRef.current = L.tileLayer(b.url, { maxZoom: b.maxZoom, attribution: "ESRI / OSM" }).addTo(map);
    baseRef.current.bringToBack();
  }, [basemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (labelsOn && !labelsRef.current) {
      labelsRef.current = L.tileLayer(LABELS_URL, { maxZoom: 18, opacity: 0.9 }).addTo(map);
    } else if (!labelsOn && labelsRef.current) {
      map.removeLayer(labelsRef.current);
      labelsRef.current = null;
    }
  }, [labelsOn]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (terrainOn && !terrainRef.current) {
      terrainRef.current = L.tileLayer(TERRAIN_URL, { maxZoom: 16, opacity: 0.5 }).addTo(map);
    } else if (!terrainOn && terrainRef.current) {
      map.removeLayer(terrainRef.current);
      terrainRef.current = null;
    }
  }, [terrainOn]);

  /* ---------------- ATM layer ---------------- */
  const loadAtms = useCallback(async () => {
    const n = NODE_BY_ID[selectedNode] || NODES[0];
    setAtmState((s) => ({ ...s, loading: true, note: "" }));
    try {
      const data = await api.atms({ node: n.id, lat: n.lat, lon: n.lon, r: 4000 });
      const list = data.atms || [];
      const g = groups.current.atms;
      g && g.clearLayers();
      list.forEach((a) => {
        if (typeof a.lat !== "number" || typeof a.lon !== "number") return;
        L.circleMarker([a.lat, a.lon], {
          radius: 4,
          color: "#f59e0b",
          weight: 1,
          fillColor: "#f59e0b",
          fillOpacity: 0.9,
        })
          .bindTooltip(`${a.name || "ATM"}${a.operator ? " · " + a.operator : ""}`, { className: "nir-tip" })
          .addTo(g);
      });
      setAtmState({ loading: false, count: list.length, note: data.degraded || "" });
    } catch (err) {
      setAtmState({ loading: false, count: 0, note: "ATM source unreachable — showing none." });
    }
  }, [selectedNode]);

  /* ---------------- chase ---------------- */
  const clearChase = useCallback(() => {
    chaseTimers.current.forEach(clearTimeout);
    chaseTimers.current = [];
    groups.current.chase && groups.current.chase.clearLayers();
  }, []);

  const stopChase = useCallback(() => {
    clearChase();
    setChaseRunning(false);
    setChaseLog([]);
  }, [clearChase]);

  const startChase = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    clearChase();
    setChaseLog([]);
    setChaseRunning(true);

    const origin = NODE_BY_ID["DL-01"];
    map.flyTo([origin.lat, origin.lon], 6, { duration: 1.2 });
    logLine("CASE OPENED: ₹3,80,000 stolen via QR scam — tracing…", "#fbbf24");
    L.circleMarker([origin.lat, origin.lon], {
      radius: 10,
      color: "#ef4444",
      weight: 2,
      fillColor: "#ef4444",
      fillOpacity: 0.95,
    })
      .bindTooltip("VICTIM ORIGIN — ₹3,80,000", { className: "nir-tip" })
      .addTo(groups.current.chase);
    addToast("CASE TRACE: ₹3,80,000 — following the money", false);

    const A = 0.42;
    const leg = (a, b, amount, hops, color, done) => {
      const na = NODE_BY_ID[a];
      const nb = NODE_BY_ID[b];
      if (!na || !nb) return done && done();
      const la = [na.lat, na.lon];
      const lb = [nb.lat, nb.lon];
      const line = L.polyline([la, lb], { color, weight: 3, opacity: 0.85, dashArray: "8 10" }).addTo(groups.current.chase);
      const dot = L.circleMarker(la, {
        radius: 6,
        fillColor: "#fbbf24",
        color: "#fff",
        weight: 2,
        fillOpacity: 1,
      }).addTo(groups.current.chase);
      const steps = 60;
      let i = 0;
      const ev = Math.pow(A, hops);
      const amt2 = Math.round(amount * ev);
      const iv = setInterval(() => {
        i++;
        const f = i / steps;
        dot.setLatLng([la[0] + (lb[0] - la[0]) * f, la[1] + (lb[1] - la[1]) * f]);
        line.setStyle({ dashOffset: String(-i * 4) });
        if (i >= steps) {
          clearInterval(iv);
          L.circleMarker(lb, {
            radius: 8,
            fillColor: color,
            color: "#fff",
            weight: 2,
            fillOpacity: 0.95,
          })
            .bindTooltip(`${fmtL(amt2)} · ${b} · α^${hops}=${ev.toFixed(3)}`, { className: "nir-tip" })
            .addTo(groups.current.chase);
          logLine(`${fmtL(amount)} moved ${a} → ${b} (arrives as ${fmtL(amt2)})`, color);
          done && done();
        }
      }, 33);
      chaseTimers.current.push(iv);
    };

    let i = 0;
    const next = () => {
      if (!chaseTimers.current || mapRef.current === null) return;
      if (i >= CHASE_SEQ.length) {
        map.flyTo(INDIA_CENTER, 5, { duration: 1.5 });
        addToast("⚠ INTERCEPT WINDOW OPEN — DL-01 · MUM-01 · BLR-01", true);
        logLine("CASH-OUT PREDICTED at 3 terminals — dispatch advised", "#ef4444");
        loadAtms();
        setChaseRunning(false);
        return;
      }
      const [a, b, amount, hops] = CHASE_SEQ[i++];
      const color = hops === 3 ? "#ef4444" : "#38bdf8";
      leg(a, b, amount, hops, color, () => {
        if (hops === 3) addToast(`💰 CASH-OUT at ${b} — intercept now`, true);
        const t = setTimeout(next, 400);
        chaseTimers.current.push(t);
      });
    };
    next();
  }, [addToast, clearChase, loadAtms, logLine]);

  const onChaseToggle = () => (chaseRunning ? stopChase() : startChase());

  return (
    <div className="term-map">
      <div className="term-map__canvas" ref={mapEl} />

      <div className="tm-controls">
        <button
          type="button"
          className="tm-btn tm-btn--chase"
          aria-pressed={chaseRunning}
          onClick={onChaseToggle}
        >
          {chaseRunning ? "■ STOP CHASE" : "▶ LIVE CHASE"}
        </button>

        <div className="tm-horizon" role="group" aria-label="Forecast horizon">
          {HORIZONS.map((h) => (
            <button
              key={h.label}
              type="button"
              aria-pressed={horizonHours === h.hours}
              onClick={() => setHorizonHours(h.hours)}
            >
              {h.label}
            </button>
          ))}
        </div>

        <button type="button" className="tm-btn" aria-pressed={basemap === "dark"} onClick={() => { pickedBasemap.current = true; setBasemap("dark"); }}>
          Dark Ops
        </button>
        <button type="button" className="tm-btn" aria-pressed={basemap === "satellite"} onClick={() => { pickedBasemap.current = true; setBasemap("satellite"); }}>
          Satellite
        </button>
        <button type="button" className="tm-btn" aria-pressed={basemap === "streets"} onClick={() => { pickedBasemap.current = true; setBasemap("streets"); }}>
          Streets
        </button>
        <button type="button" className="tm-btn" aria-pressed={labelsOn} onClick={() => setLabelsOn((v) => !v)}>
          Labels
        </button>
        <button type="button" className="tm-btn" aria-pressed={terrainOn} onClick={() => setTerrainOn((v) => !v)}>
          ⛰ Terrain
        </button>
        <button type="button" className="tm-btn" onClick={loadAtms} disabled={atmState.loading}>
          {atmState.loading ? "ATM…" : `ATM LAYER${atmState.count ? ` (${atmState.count})` : ""}`}
        </button>

        <span className="tm-legend" title="Terminal risk score">
          {[
            ["≥80", "#ef4444"],
            ["≥65", "#f97316"],
            ["≥40", "#eab308"],
            ["≥25", "#06b6d4"],
            ["<25", "#10b981"],
          ].map(([label, color]) => (
            <span key={label}>
              <i style={{ background: color }} />
              {label}
            </span>
          ))}
        </span>
      </div>

      {atmState.note && <div className="tm-note">ATM source: {atmState.note}</div>}

      {chaseLog.length > 0 && (
        <div className="tm-log" aria-live="polite">
          <span className="tm-log__title">CHASE LOG — CASE NCRP-2026-991823</span>
          {chaseLog.slice(0, 40).map((l, i) => (
            <div key={i} className="tm-log__line" style={{ color: l.color }}>
              [{l.t}] {l.msg}
            </div>
          ))}
        </div>
      )}

      <div className="tm-toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`tm-toast${t.bad ? " tm-toast--bad" : ""}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
