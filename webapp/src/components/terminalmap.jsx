import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./terminalmap.css";
import { useLiveFeed } from "../live/uselivefeed.jsx";
import { useConsole } from "../context/consolecontext.jsx";
import { useTheme } from "../context/themecontext.jsx";
import api from "../lib/api.js";
import {
  BASEMAPS,
  CHASE_SEQ,
  INDIA_CENTER,
  INDIA_ZOOM,
  LABELS_URL,
  NODE_BY_ID,
  NODES,
  TERRAIN_URL,
} from "../lib/terminals.js";
import { evaluateTerminal, riskColor } from "../lib/hawkes.js";
import { clockNow } from "../lib/format.js";

const HORIZONS = [
  { label: "NOW", hours: 0 },
  { label: "+2h", hours: 2 },
  { label: "+6h", hours: 6 },
  { label: "+24h", hours: 24 },
];

function fmtL(inr) {
  return "₹" + (Number(inr) / 100000).toFixed(2) + "L";
}

// Stable pseudo-random offset so incident dots near a terminal don't stack.
function jitter(seed, span) {
  let h = 0;
  const s = String(seed || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100000;
  return ((h % 1000) / 1000 - 0.5) * span;
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
  const toolsBtnRef = useRef(null);
  const toolsPanelRef = useRef(null);
  const pickedBasemap = useRef(false);
  const playTimer = useRef(null);

  const [basemap, setBasemap] = useState("dark");
  const [labelsOn, setLabelsOn] = useState(false);
  const [terrainOn, setTerrainOn] = useState(false);
  const [riskOn, setRiskOn] = useState(true);
  const [upiOn, setUpiOn] = useState(false);
  const [incidentsOn, setIncidentsOn] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [chaseRunning, setChaseRunning] = useState(false);
  const [chaseLog, setChaseLog] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [atmState, setAtmState] = useState({ loading: false, count: 0, note: "" });
  const [toolsOpen, setToolsOpen] = useState(false);
  const [dropUp, setDropUp] = useState(true);
  const [sections, setSections] = useState({ basemaps: true, layers: true, data: true, view: true });

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
    const map = L.map(mapEl.current, { zoomControl: false, attributionControl: true }).setView(
      INDIA_CENTER,
      INDIA_ZOOM
    );
    mapRef.current = map;
    // Leaflet zoom parked top-right so it never collides with LIVE CHASE
    L.control.zoom({ position: "topright" }).addTo(map);

    baseRef.current = L.tileLayer(BASEMAPS.dark.url, { maxZoom: BASEMAPS.dark.maxZoom, attribution: "ESRI" }).addTo(map);

    groups.current.markers = L.layerGroup().addTo(map);
    groups.current.upi = L.layerGroup().addTo(map);
    groups.current.incidents = L.layerGroup().addTo(map);
    groups.current.selection = L.layerGroup().addTo(map);
    groups.current.pulses = L.layerGroup().addTo(map);
    groups.current.atms = L.layerGroup().addTo(map);
    groups.current.chase = L.layerGroup().addTo(map);

    L.control.scale({ imperial: false, position: "bottomright" }).addTo(map);

    const recordCentre = () => {
      const c = map.getCenter();
      if (mapEl.current) mapEl.current.dataset.center = `${c.lat.toFixed(2)},${c.lng.toFixed(2)}`;
    };
    map.on("moveend", recordCentre);
    recordCentre();

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

  /* ---------------- UPI volume layer ---------------- */
  const renderUpi = useCallback(() => {
    const g = groups.current.upi;
    if (!g) return;
    g.clearLayers();
    NODES.forEach((n) => {
      const m = evaluateTerminal(n, horizonHours);
      // radius from projected flow, kept inside a readable band
      const r = 8 + Math.min(26, Math.sqrt(Math.max(0, m.projectedFlow) / 9000));
      L.circleMarker([n.lat, n.lon], {
        radius: r,
        color: "#7dd3fc",
        weight: 1,
        opacity: 0.7,
        fillColor: "#38bdf8",
        fillOpacity: 0.16,
      })
        .bindTooltip(`${n.id} · UPI volume ₹${Number(m.projectedFlow).toLocaleString("en-IN")}`, { className: "nir-tip" })
        .addTo(g);
    });
    if (mapEl.current) mapEl.current.dataset.upi = String(g.getLayers().length);
  }, [horizonHours]);

  /* ---------------- fraud incidents layer ---------------- */
  const renderIncidents = useCallback(() => {
    const g = groups.current.incidents;
    if (!g) return;
    g.clearLayers();
    const recent = complaints.slice(0, 60);
    recent.forEach((c) => {
      const n = NODE_BY_ID[c.target_terminal_id];
      if (!n) return;
      const lat = n.lat + jitter(c.ack_no, 1.6);
      const lon = n.lon + jitter(c.ack_no + "x", 1.6);
      L.circleMarker([lat, lon], {
        radius: 3,
        color: "#fbbf24",
        weight: 1,
        opacity: 0.9,
        fillColor: "#fbbf24",
        fillOpacity: 0.9,
      })
        .bindTooltip(`${c.ack_no || "incident"} · ${c.target_terminal_id}`, { className: "nir-tip" })
        .addTo(g);
    });
    if (mapEl.current) mapEl.current.dataset.incidents = String(g.getLayers().length);
  }, [complaints]);

  useEffect(() => {
    renderUpi();
  }, [renderUpi]);
  useEffect(() => {
    renderIncidents();
  }, [renderIncidents]);

  /* layer visibility */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const g = groups.current.markers;
    const p = groups.current.pulses;
    if (!g) return;
    if (riskOn) {
      if (!map.hasLayer(g)) g.addTo(map);
      if (p && !map.hasLayer(p)) p.addTo(map);
    } else {
      if (map.hasLayer(g)) map.removeLayer(g);
      if (p && map.hasLayer(p)) map.removeLayer(p);
    }
  }, [riskOn]);

  useEffect(() => {
    const map = mapRef.current;
    const g = groups.current.upi;
    if (!map || !g) return;
    if (upiOn && !map.hasLayer(g)) g.addTo(map);
    if (!upiOn && map.hasLayer(g)) map.removeLayer(g);
  }, [upiOn]);

  useEffect(() => {
    const map = mapRef.current;
    const g = groups.current.incidents;
    if (!map || !g) return;
    if (incidentsOn && !map.hasLayer(g)) g.addTo(map);
    if (!incidentsOn && map.hasLayer(g)) map.removeLayer(g);
  }, [incidentsOn]);

  if (mapEl.current) {
    // test hook: layer state snapshot
    mapEl.current.dataset.layers = JSON.stringify({ risk: riskOn, upi: upiOn, incidents: incidentsOn });
  }

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

  /* ---------------- horizon playback ---------------- */
  useEffect(() => {
    if (!playing) {
      if (playTimer.current) clearInterval(playTimer.current);
      playTimer.current = null;
      return undefined;
    }
    const seq = [0, 2, 6, 24];
    playTimer.current = setInterval(() => {
      setHorizonHours((h) => seq[(seq.indexOf(h) + 1) % seq.length]);
    }, 1500);
    return () => {
      if (playTimer.current) clearInterval(playTimer.current);
      playTimer.current = null;
    };
  }, [playing, setHorizonHours]);

  const confidence = Math.max(54, 86 - Math.round(horizonHours * 1.35));

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
    if (pickedBasemap.current) return;
    setBasemap(theme === "light" ? "streets" : "dark");
  }, [theme]);

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
        // Transparent gem marker: the emoji provides the diamond shape, so no
        // square background/border is needed and nearby markers stay visible.
        const S = 16;
        const atmIcon = L.divIcon({
          className: "atm-gem-icon",
          html: `<span style="width:${S}px;height:${S}px;display:flex;align-items:center;justify-content:center;font-size:13px;line-height:${S}px;text-shadow:0 0 6px rgba(83,199,240,.9);">💠</span>`,
          iconSize: [S, S],
          iconAnchor: [S / 2, S / 2],
        });
        L.marker([a.lat, a.lon], { icon: atmIcon, keyboard: false })
          .bindTooltip(`ATM — ${a.name || "ATM"}${a.operator ? " · " + a.operator : ""}`, { className: "nir-tip" })
          .addTo(g);
      });
      setAtmState({ loading: false, count: list.length, note: data.degraded || "" });
    } catch (err) {
      setAtmState({ loading: false, count: 0, note: "source unreachable" });
    }
  }, [selectedNode]);
  const atmText = atmState.loading
    ? "fetching…"
    : atmState.note
    ? `degraded · ${atmState.note}`
    : atmState.count
    ? `${atmState.count} ATMs loaded`
    : "idle";

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

  const recenter = useCallback(() => {
    const map = mapRef.current;
    if (map) map.flyTo(INDIA_CENTER, INDIA_ZOOM, { duration: 0.8 });
  }, []);

  const refreshAll = useCallback(() => {
    renderMarkers();
    renderUpi();
    renderIncidents();
    loadAtms();
    addToast("Map layers refreshed", false);
  }, [renderMarkers, renderUpi, renderIncidents, loadAtms, addToast]);

  /* ---------------- MAP TOOLS panel: open/close, flip, Esc ---------------- */
  const openTools = useCallback(() => {
    const btn = toolsBtnRef.current;
    if (btn) {
      const r = btn.getBoundingClientRect();
      const panelH = 430; // conservative estimate for the flip decision
      setDropUp(r.top > panelH + 12);
    }
    setToolsOpen(true);
  }, []);

  useEffect(() => {
    if (!toolsOpen) return undefined;
    const onDown = (e) => {
      const p = toolsPanelRef.current;
      const b = toolsBtnRef.current;
      if (p && p.contains(e.target)) return;
      if (b && b.contains(e.target)) return;
      setToolsOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setToolsOpen(false);
        if (toolsBtnRef.current) toolsBtnRef.current.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [toolsOpen]);

  const isMobile = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 1023px)").matches;
  const toggleSection = (k) => setSections((s) => ({ ...s, [k]: !s[k] }));

  const Section = ({ id, title, children }) => {
    const open = sections[id];
    return (
      <div className="tm-sec">
        <button
          type="button"
          className="tm-sec__head"
          aria-expanded={open}
          onClick={() => toggleSection(id)}
        >
          <span>{title}</span>
          <span aria-hidden="true">{open ? "▴" : "▾"}</span>
        </button>
        {open && <div className="tm-sec__body">{children}</div>}
      </div>
    );
  };

  return (
    <div className="term-map">
      <div className="term-map__canvas" ref={mapEl} />

      {/* showpiece: stays on the map, never inside MAP TOOLS */}
      <div className="tm-top-left">
        <button type="button" className="tm-btn tm-btn--chase" aria-pressed={chaseRunning} onClick={onChaseToggle}>
          {chaseRunning ? "■ STOP CHASE" : "▶ LIVE CHASE"}
        </button>
      </div>

      <div className="tm-top-right">
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

      {/* consolidated tools */}
      <div className="tm-tools">
        {toolsOpen && (
          <div className={`tm-panel ${dropUp ? "tm-panel--up" : "tm-panel--down"}`} ref={toolsPanelRef} role="dialog" aria-label="Map tools">
            <div className="tm-panel__head">
              <span className="hud-label">MAP TOOLS</span>
              <button type="button" className="tm-btn tm-btn--icon" onClick={() => setToolsOpen(false)} aria-label="Close map tools">
                ✕
              </button>
            </div>

            <Section id="basemaps" title="BASEMAPS">
              <div role="radiogroup" aria-label="Basemap" className="tm-rows">
                {[
                  ["dark", "Dark Ops (ESRI)"],
                  ["satellite", "Satellite (ESRI)"],
                  ["streets", "Streets (OSM)"],
                ].map(([id, label]) => (
                  <label key={id} className="tm-row">
                    <input
                      type="radio"
                      name="bm"
                      checked={basemap === id}
                      onChange={() => {
                        pickedBasemap.current = true;
                        setBasemap(id);
                      }}
                    />
                    <span>{label}</span>
                  </label>
                ))}
                <label className="tm-row">
                  <input type="checkbox" checked={labelsOn} onChange={() => setLabelsOn((v) => !v)} />
                  <span>Place labels</span>
                </label>
                <label className="tm-row">
                  <input type="checkbox" checked={terrainOn} onChange={() => setTerrainOn((v) => !v)} />
                  <span>Terrain hillshade</span>
                </label>
              </div>
            </Section>

            <Section id="layers" title="LAYERS">
              <div className="tm-rows">
                <label className="tm-row">
                  <input type="checkbox" checked={riskOn} onChange={() => setRiskOn((v) => !v)} />
                  <span>Risk heat (Hawkes)</span>
                </label>
                <label className="tm-row">
                  <input type="checkbox" checked={upiOn} onChange={() => setUpiOn((v) => !v)} />
                  <span>UPI volume</span>
                </label>
                <label className="tm-row">
                  <input type="checkbox" checked={incidentsOn} onChange={() => setIncidentsOn((v) => !v)} />
                  <span>Fraud incidents</span>
                </label>
                <button type="button" className="tm-btn tm-row-btn" onClick={refreshAll}>
                  REFRESH
                </button>
              </div>
            </Section>

            <Section id="data" title="DATA">
              <div className="tm-rows">
                <button type="button" className="tm-btn tm-row-btn" onClick={loadAtms} disabled={atmState.loading}>
                  {atmState.loading ? "ATM LAYER (LIVE OSM) — fetching…" : "ATM LAYER (LIVE OSM)"}
                </button>
                <span className="tm-state" data-atm-state={atmText}>
                  {atmText}
                </span>
              </div>
            </Section>

            <Section id="view" title="VIEW">
              <div className="tm-rows">
                <div className="tm-hz" role="radiogroup" aria-label="Forecast horizon">
                  {HORIZONS.map((h) => (
                    <label key={h.label} className="tm-hz__item">
                      <input
                        type="radio"
                        name="hz"
                        checked={horizonHours === h.hours}
                        onChange={() => setHorizonHours(h.hours)}
                      />
                      <span>{h.label}</span>
                    </label>
                  ))}
                </div>
                <button type="button" className="tm-btn tm-row-btn" onClick={recenter}>
                  RECENTER (all-India)
                </button>
                <button type="button" className="tm-btn tm-row-btn" aria-pressed={playing} onClick={() => setPlaying((v) => !v)}>
                  {playing ? "PAUSE HORIZON PLAYBACK" : "PLAY HORIZON"}
                </button>
                <div className="tm-row tm-row--static">
                  <span>Confidence</span>
                  <b data-conf={confidence} style={{ color: "var(--accent-cyan)" }}>{confidence}%</b>
                </div>
              </div>
            </Section>
          </div>
        )}

        <button
          type="button"
          className="tm-btn tm-tools__btn"
          ref={toolsBtnRef}
          aria-expanded={toolsOpen}
          onClick={() => (toolsOpen ? setToolsOpen(false) : openTools())}
        >
          MAP TOOLS {toolsOpen ? "▴" : "▾"}
        </button>
      </div>

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
