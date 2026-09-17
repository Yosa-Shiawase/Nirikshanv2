import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveFeed } from "../live/useLiveFeed";
import { useConsole } from "../context/ConsoleContext";
import { useTheme } from "../context/ThemeContext";
import { THEMES } from "../lib/theme";
import api from "../lib/api";
import Provenance from "../components/Provenance";
import { AlertsToggle } from "../components/AlertBanner";
import { TERMINALS, TERMINAL_META, hopDecay, rankTerminals, zoneRisk } from "../lib/hawkes";
import { fmtINR, fmtCompactINR, riskTone, secondsAgo } from "../lib/format";
import { exportElementToPdf } from "../lib/exportPdf";

/* ---- shared bits ---------------------------------------------------------- */

function Pane({ title, subtitle, children, right }) {
  return (
    <section className="fade-in flex flex-col gap-3 h-full">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg md:text-xl font-semibold glow-text" style={{ color: "var(--accent-cyan)" }}>
            {title}
          </h2>
          {subtitle && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Coming({ feature, eta, note }) {
  return (
    <div className="hud-panel p-4 flex flex-col gap-2" style={{ borderStyle: "dashed" }}>
      <div className="hud-chip" style={{ alignSelf: "flex-start" }}>{feature}</div>
      <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
        {note} <b style={{ color: "var(--accent-cyan)" }}>{eta}</b>.
      </p>
    </div>
  );
}

function Card({ title, right, children, style }) {
  return (
    <div className="hud-panel p-3" style={style}>
      {(title || right) && (
        <div className="flex items-center justify-between mb-2">
          <div className="hud-label">{title}</div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

/* ---- F1/F2 (T3 placeholder) ---------------------------------------------- */

function MapView() {
  const { complaints, anomalies, connected } = useLiveFeed();
  const last = complaints[0];
  return (
    <Pane
      title="RISK MAP · LIVE CHASE"
      subtitle="Hawkes-scored terminals · time-horizon slider · animated theft trace"
      right={<span className="hud-chip">{connected ? "SSE LIVE" : "SSE LINK…"}</span>}
    >
      <div className="hud-panel relative flex-1 flex items-center justify-center overflow-hidden" style={{ minHeight: 240 }}>
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
            backgroundSize: "38px 38px",
          }}
        />
        <div className="relative text-center px-4">
          <div className="hud-label mb-1">Leaflet map surface</div>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>F1 map + F2 animated chase mount here (Leaflet in a ref).</p>
          <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 6 }}>
            live pulses so far: {complaints.length} · anomalies: {anomalies.length}
          </p>
          {last && (
            <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>
              last: {last.ack_no || "—"} @ {last.target_terminal_id || "—"} · {fmtINR(last.disputed_amount_inr)}
            </p>
          )}
        </div>
      </div>
      <Coming feature="F1 + F2" eta="T3" note="11 Indian terminals, basemap/label/terrain toggles, ATM layer, money arcs with 0.42^n hop-decay labels, INTERCEPT toasts, chase log." />
    </Pane>
  );
}

/* ---- F4 ALERTS ------------------------------------------------------------ */

const SAMPLES = {
  FRAUD: { sender: "+92-3001122334", text: "Dear customer your KYC will be blocked today. Share OTP and click here http://bit.ly/kyc-fix to avoid account suspended." },
  LOTTERY: { sender: "VK-LOTTERY", text: "Congratulations! You have won Rs 25,00,000 in KBC lucky draw. Pay processing fee via refund link to claim your prize." },
  BENIGN: { sender: "HDFCBK", text: "Your account 1234 is credited with Rs 5,000 on 17-09. Balance 12,345. Thank you." },
};

function AlertsView() {
  const { smsAlerts, counters } = useLiveFeed();
  const [sender, setSender] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function analyse() {
    if (!text.trim()) return;
    setBusy(true);
    setError("");
    try {
      const r = await api.smsPlain(sender || "unknown", text);
      setResult(r);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pane
      title="ALERTS · SMS THREAT SENSOR"
      subtitle="Paste an SMS → POST /sms-plain → verdict + matched rules"
      right={<AlertsToggle />}
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Threat Sensor" right={<Provenance source="LIVE" />}>
          <input
            className="hud-btn w-full mb-2"
            style={{ cursor: "text", textAlign: "left" }}
            placeholder="sender (e.g. +92-300... or VK-LOTTERY)"
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            aria-label="SMS sender"
          />
          <textarea
            className="w-full rounded-lg p-2"
            rows={4}
            style={{ background: "var(--bg-z2)", border: "1px solid var(--border)", color: "var(--text-main)", fontSize: 13, resize: "vertical" }}
            placeholder="Paste the SMS body here…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="SMS body"
          />
          <div className="flex flex-wrap gap-2 mt-2">
            {Object.keys(SAMPLES).map((k) => (
              <button
                key={k}
                type="button"
                className="hud-btn"
                style={{ minHeight: 40 }}
                onClick={() => {
                  setSender(SAMPLES[k].sender);
                  setText(SAMPLES[k].text);
                }}
              >
                {k}
              </button>
            ))}
            <button type="button" className="hud-btn ml-auto" style={{ minHeight: 40 }} disabled={busy} onClick={analyse}>
              {busy ? "ANALYSING…" : "ANALYSE ▶"}
            </button>
          </div>
          {error && <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 8 }}>Error: {error}</p>}
          {result && (
            <div className="mt-3 rounded-lg p-3" style={{ background: "var(--bg-z2)", border: `1px solid ${riskTone(result.risk_score)}` }}>
              <div className="flex items-center justify-between">
                <span className="hud-label" style={{ color: riskTone(result.risk_score) }}>{result.verdict}</span>
                <span className="hud-chip" style={{ borderColor: riskTone(result.risk_score), color: riskTone(result.risk_score) }}>
                  risk {result.risk_score}/100
                </span>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {(result.matched || []).length === 0 ? (
                  <span style={{ fontSize: 12, color: "var(--text-dim)" }}>no rules matched</span>
                ) : (
                  result.matched.map((m) => (
                    <span key={m} className="hud-chip">{m}</span>
                  ))
                )}
              </div>
            </div>
          )}
        </Card>

        <Card title={`Live Feed (${counters.sms})`} right={<Provenance source="LIVE" />}>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: 12 }}>
              <thead>
                <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
                  <th className="py-1">TS</th><th>Sender</th><th>Verdict</th><th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {smsAlerts.length === 0 ? (
                  <tr><td colSpan={4} style={{ color: "var(--text-dim)", paddingTop: 8 }}>No SMS alerts yet.</td></tr>
                ) : (
                  smsAlerts.slice(0, 12).map((s, i) => (
                    <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="py-1" style={{ color: "var(--text-dim)" }}>{s.ts || "—"}</td>
                      <td className="truncate" style={{ maxWidth: 140 }}>{s.sender}</td>
                      <td style={{ color: riskTone(s.risk_score) }}>{s.verdict}</td>
                      <td style={{ color: riskTone(s.risk_score) }}>{s.risk_score}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </Pane>
  );
}

/* ---- F5 ENTITIES ---------------------------------------------------------- */

function EntitiesView() {
  const { complaints } = useLiveFeed();
  const { selectedNode, setSelectedNode, watchlist, toggleWatch, isWatched } = useConsole();
  const [query, setQuery] = useState("");

  const { nodes, total } = useMemo(() => {
    const counts = {};
    for (const c of complaints) {
      const v = c.victim_vpa;
      if (!v) continue;
      counts[v] = counts[v] || { vpa: v, n: 0, inr: 0, terms: {} };
      counts[v].n += 1;
      counts[v].inr += Number(c.disputed_amount_inr) || 0;
      counts[v].terms[c.target_terminal_id] = (counts[v].terms[c.target_terminal_id] || 0) + 1;
    }
    const arr = Object.values(counts).sort((a, b) => b.n - a.n);
    return { nodes: arr, total: arr.length };
  }, [complaints]);

  const filtered = nodes.filter((n) => n.vpa.toLowerCase().includes(query.toLowerCase()));

  return (
    <Pane
      title="ENTITIES"
      subtitle="Suspect cluster · watchlist · search"
      right={<span className="hud-chip">{total} VPAs · {watchlist.length} watched</span>}
    >
      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Suspect Cluster (live)" right={<Provenance source="LIVE" />}>
          <ClusterGraph nodes={filtered.slice(0, 9)} center={selectedNode} onPick={(vpa) => toggleWatch(vpa)} />
        </Card>

        <Card title="Peripherals">
          <input
            className="hud-btn w-full mb-2"
            style={{ cursor: "text", textAlign: "left" }}
            placeholder="filter VPA…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter VPA"
          />
          <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: 340 }}>
            {filtered.length === 0 && <span style={{ fontSize: 12, color: "var(--text-dim)" }}>no entities buffered</span>}
            {filtered.slice(0, 40).map((n) => (
              <div key={n.vpa} className="flex items-center gap-2 rounded-md px-2 py-1" style={{ background: "var(--bg-z2)", border: "1px solid var(--border)", minHeight: 44 }}>
                <button type="button" className="flex-1 text-left min-w-0" onClick={() => toggleWatch(n.vpa)} style={{ background: "none", border: "none", color: "var(--text-main)", cursor: "pointer" }}>
                  <div className="truncate" style={{ fontSize: 13 }}>{n.vpa}</div>
                  <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{n.n} event{n.n === 1 ? "" : "s"} · {fmtCompactINR(n.inr)}</div>
                </button>
                <button
                  type="button"
                  className="hud-btn"
                  onClick={() => {
                    const top = Object.entries(n.terms).sort((a, b) => b[1] - a[1])[0];
                    if (top) setSelectedNode(top[0]);
                  }}
                  title="Focus this VPA's top node"
                  style={{ minHeight: 36 }}
                >
                  focus
                </button>
                <button type="button" className="hud-btn" onClick={() => toggleWatch(n.vpa)} title="Watchlist" style={{ minHeight: 36 }}>
                  {isWatched(n.vpa) ? "★" : "☆"}
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Coming feature="F5+ (graph layout)" eta="T5" note="Force-directed layout + hop-aware edge weighting lands in polish." />
    </Pane>
  );
}

function ClusterGraph({ nodes, center, onPick }) {
  const W = 640, H = 320;
  const cx = W / 2, cy = H / 2, R = 110;
  if (nodes.length === 0) {
    return <p style={{ fontSize: 12, color: "var(--text-dim)" }}>no entity cluster yet — waiting for stream…</p>;
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ maxHeight: 300 }} role="img" aria-label="Suspect cluster graph">
      {nodes.map((n, i) => {
        const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
        const x = cx + R * Math.cos(a);
        const y = cy + R * Math.sin(a);
        return (
          <g key={n.vpa}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth="1.5" />
            <circle cx={x} cy={y} r={8 + Math.min(10, n.n)} fill="color-mix(in srgb, var(--danger) 55%, var(--bg-card))" stroke="var(--danger)" />
            <text x={x} y={y - 18} fill="var(--text-muted)" fontSize="10" textAnchor="middle">{n.vpa.length > 16 ? n.vpa.slice(0, 15) + "…" : n.vpa}</text>
            <circle cx={x} cy={y} r={16} fill="transparent" style={{ cursor: "pointer" }} onClick={() => onPick(n.vpa)}>
              <title>{n.vpa} · {n.n} events</title>
            </circle>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={16} fill="color-mix(in srgb, var(--accent-cyan) 40%, var(--bg-card))" stroke="var(--accent-cyan)" />
      <text x={cx} y={cy + 34} fill="var(--accent-cyan)" fontSize="12" textAnchor="middle">{center}</text>
    </svg>
  );
}

/* ---- F6 TRANSACTIONS ------------------------------------------------------ */

function TransactionsView() {
  const { caseTrace, refreshCaseTrace, bnssStrict } = useConsole();
  const [selected, setSelected] = useState(null);
  const data = caseTrace.data;

  // Auto-focus the first live-matched node once the trace loads.
  useEffect(() => {
    if (selected || !data) return;
    for (const L of data.layers || []) {
      const live = (L.live || [])[0];
      if (live) {
        setSelected({ layer: L, vpa: live.id, live });
        return;
      }
    }
  }, [data, selected]);

  return (
    <Pane
      title="TRANSACTIONS"
      subtitle="Active case trace · money-trail DAG · Section-102 lien"
      right={
        <button type="button" className="hud-btn" onClick={refreshCaseTrace} disabled={caseTrace.loading}>
          {caseTrace.loading ? "REFRESHING…" : "REFRESH"}
        </button>
      }
    >
      {caseTrace.error && <p style={{ fontSize: 12, color: "var(--danger)" }}>trace error: {caseTrace.error}</p>}

      <Card
        title="Active Case Trace"
        right={<Provenance source="LIVE" />}
      >
        {!data ? (
          <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Loading case trace…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
              <Stat label="Case" value={data.case?.case_id || "—"} />
              <Stat label="Stolen" value={fmtINR(data.case?.stolen_inr)} tone="var(--danger)" />
              <Stat label="Victim" value={data.case?.victim || "—"} />
              <Stat label="Live events (30m)" value={data.total_live_events ?? 0} tone="var(--ok)" />
            </div>

            <div className="overflow-x-auto">
              <div className="flex items-stretch gap-2 min-w-[640px]">
                {(data.layers || []).map((L) => (
                  <div key={L.hop} className="flex-1 rounded-lg p-2" style={{ background: "var(--bg-z2)", border: "1px solid var(--border)" }}>
                    <div className="hud-label">hop {L.hop} · {L.label}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
                      {fmtCompactINR(L.amount)} · decay {hopDecay(L.hop).toFixed(3)}
                    </div>
                    <div className="flex flex-col gap-1">
                      {(L.vpas || []).map((v) => {
                        const live = (L.live || []).find((x) => x.id === v);
                        const isLive = !!live;
                        return (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setSelected({ layer: L, vpa: v, live })}
                            className="text-left rounded-md px-2 py-1"
                            style={{
                              background: isLive ? "color-mix(in srgb, var(--ok) 18%, var(--bg-card))" : "var(--bg-z1)",
                              border: `1px solid ${isLive ? "var(--ok)" : "var(--border)"}`,
                              fontSize: 12,
                              minHeight: 36,
                            }}
                          >
                            <div className="truncate">{v}</div>
                            {isLive && (
                              <div style={{ color: "var(--ok)", fontSize: 11 }}>
                                LIVE · {live.events} evt · {fmtCompactINR(live.inr)}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </Card>

      <Card title="Node Detail">
        {!selected ? (
          <p style={{ fontSize: 12, color: "var(--text-dim)" }}>Select a node in the DAG to see lien detail.</p>
        ) : (
          <div style={{ fontSize: 13 }}>
            <div><b style={{ color: "var(--accent-cyan)" }}>{selected.vpa}</b> — hop {selected.layer.hop} ({selected.layer.label})</div>
            <div style={{ color: "var(--text-muted)", marginTop: 4 }}>
              Layer exposure: {fmtINR(selected.layer.amount)} · decay factor {hopDecay(selected.layer.hop).toFixed(4)}
            </div>
            {selected.live && (
              <div style={{ color: "var(--ok)", marginTop: 4 }}>
                Live match: {selected.live.events} events · {fmtINR(selected.live.inr)} · last {selected.live.minutes_ago}m ago
              </div>
            )}
            <p style={{ marginTop: 8, color: bnssStrict ? "var(--text-main)" : "var(--warn)" }}>
              Section 102 BNSS: lien is restricted to the disputed value only
              {bnssStrict ? " (strict cap enforced)." : " — strict mode OFF, apply cap before action."}
            </p>
          </div>
        )}
      </Card>
    </Pane>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-lg p-2" style={{ background: "var(--bg-z2)", border: "1px solid var(--border)" }}>
      <div className="hud-label">{label}</div>
      <div style={{ fontSize: 15, color: tone || "var(--text-main)" }} className="truncate">{value}</div>
    </div>
  );
}

/* ---- F7 DASHBOARD --------------------------------------------------------- */

function DashboardView() {
  const { complaints, anomalies, counters } = useLiveFeed();
  const { hawkes, horizonHours, selectedNode } = useConsole();

  const kpis = useMemo(() => {
    const disputed = complaints.slice(0, 50).reduce((a, c) => a + (Number(c.disputed_amount_inr) || 0), 0);
    return [
      { label: "Complaints", value: counters.complaints, tone: "var(--accent-cyan)" },
      { label: "Anomalies", value: counters.anomalies, tone: "var(--danger)" },
      { label: "SMS alerts", value: counters.sms, tone: "var(--warn)" },
      { label: "Disputed (50)", value: fmtCompactINR(disputed), tone: "var(--ok)" },
    ];
  }, [complaints, counters]);

  const ranked = useMemo(() => rankTerminals(complaints, hawkes, horizonHours).slice(0, 8), [complaints, hawkes, horizonHours]);
  const zones = useMemo(() => zoneRisk(complaints, hawkes, horizonHours), [complaints, hawkes, horizonHours]);
  const topSource = complaints[0]?.source;

  return (
    <Pane
      title="DASHBOARD"
      subtitle="Command overview · live KPIs · regional risk"
      right={<Provenance source={topSource || "LIVE"} />}
    >
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="hud-panel p-3">
            <div className="hud-label">{k.label}</div>
            <div className="text-xl md:text-2xl font-semibold" style={{ color: k.tone }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Regional Risk (zone λ)" right={<span className="hud-chip">horizon {horizonHours === 0 ? "NOW" : `+${horizonHours}h`}</span>}>
          {zones.length === 0 && <p style={{ fontSize: 12, color: "var(--text-dim)" }}>no data yet</p>}
          <div className="flex flex-col gap-2">
            {zones.map((z) => (
              <div key={z.zone}>
                <div className="flex justify-between" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  <span>{z.zone}</span><span>{z.lambda.toFixed(2)}</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: "var(--bg-z2)", overflow: "hidden" }}>
                  <div style={{ width: `${Math.round(z.share * 100)}%`, height: "100%", background: "var(--accent-cyan)", boxShadow: "0 0 10px var(--glow)" }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Terminal Ranking (Hawkes λ)">
          <div className="flex flex-col gap-1">
            {ranked.map((r) => (
              <div
                key={r.terminal}
                className="flex items-center justify-between rounded-md px-2 py-1"
                style={{ background: r.terminal === selectedNode ? "color-mix(in srgb, var(--accent-cyan) 14%, transparent)" : "var(--bg-z2)", border: "1px solid var(--border)", minHeight: 36 }}
              >
                <span style={{ fontSize: 13 }}>{r.terminal} <span style={{ color: "var(--text-dim)" }}>{r.city}</span></span>
                <span style={{ fontSize: 13, color: "var(--warn)" }}>{r.lambda.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Live Stream" right={<Provenance source={topSource || "LIVE"} />}>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontSize: 12 }}>
            <thead>
              <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
                <th className="py-1">ACK</th><th>Terminal</th><th>Victim VPA</th><th>Amount</th><th>Hop</th><th>Provenance</th><th>Age</th>
              </tr>
            </thead>
            <tbody>
              {complaints.length === 0 ? (
                <tr><td colSpan={7} style={{ color: "var(--text-dim)", paddingTop: 8 }}>waiting for stream…</td></tr>
              ) : (
                complaints.slice(0, 12).map((c, i) => (
                  <tr key={(c.ack_no || "c") + i} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="py-1" style={{ color: "var(--accent-cyan)" }}>{c.ack_no}</td>
                    <td>{c.target_terminal_id}</td>
                    <td className="truncate" style={{ maxWidth: 160 }}>{c.victim_vpa}</td>
                    <td>{fmtINR(c.disputed_amount_inr)}</td>
                    <td>{c.hop_count}</td>
                    <td><Provenance source={c.source} /></td>
                    <td style={{ color: "var(--text-dim)" }}>{secondsAgo(c.timestamp)}s</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </Pane>
  );
}

/* ---- F8 REPORTS ----------------------------------------------------------- */

function ReportsView() {
  const { complaints } = useLiveFeed();
  const { selectedNode, bnssStrict, setSelectedNode } = useConsole();
  const dossierRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState("");

  const rows = useMemo(
    () => complaints.filter((c) => c.target_terminal_id === selectedNode),
    [complaints, selectedNode]
  );
  const disputedTotal = rows.reduce((a, c) => a + (Number(c.disputed_amount_inr) || 0), 0);

  async function doExport() {
    setExporting(true);
    setExportMsg("");
    try {
      await exportElementToPdf(dossierRef.current, `NIRAKSHAN-dossier-${selectedNode}.pdf`);
      setExportMsg("PDF export triggered.");
    } catch (err) {
      setExportMsg("Export failed: " + String(err.message || err));
    } finally {
      setExporting(false);
    }
  }

  return (
    <Pane
      title="REPORTS"
      subtitle="Dossier archive · preview · EXPORT PDF (Section 102 BNSS)"
      right={
        <button type="button" className="hud-btn" onClick={doExport} disabled={exporting}>
          {exporting ? "EXPORTING…" : "EXPORT PDF"}
        </button>
      }
    >
      <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
        <Card title="Archive">
          <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: 360 }}>
            {TERMINALS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSelectedNode(t)}
                className="flex items-center justify-between rounded-md px-2 py-1 text-left"
                style={{
                  background: t === selectedNode ? "color-mix(in srgb, var(--accent-cyan) 14%, transparent)" : "var(--bg-z2)",
                  border: "1px solid var(--border)",
                  minHeight: 40,
                }}
              >
                <span style={{ fontSize: 13 }}>{t}</span>
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{TERMINAL_META[t]?.city}</span>
              </button>
            ))}
          </div>
        </Card>

        <div>
          {exportMsg && <p style={{ fontSize: 12, color: "var(--ok)", marginBottom: 6 }}>{exportMsg}</p>}
          <div
            ref={dossierRef}
            style={{
              background: "var(--bg-core)",
              color: "var(--text-main)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 16,
            }}
          >
            <div style={{ borderBottom: "2px solid var(--accent-cyan)", paddingBottom: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--accent-cyan)" }}>NIRAKSHAN — CASE DOSSIER</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Section 102 BNSS · lien restricted to disputed value only · Node {selectedNode} ({TERMINAL_META[selectedNode]?.city})
              </div>
            </div>
            <table className="w-full" style={{ fontSize: 12 }}>
              <thead>
                <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
                  <th style={{ padding: "4px 0" }}>ACK</th><th>Victim VPA</th><th>Amount (disputed)</th><th>Hop</th><th>Time</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={5} style={{ color: "var(--text-dim)", paddingTop: 8 }}>No buffered complaints for this node.</td></tr>
                ) : (
                  rows.slice(0, 25).map((c, i) => (
                    <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "4px 0" }}>{c.ack_no}</td>
                      <td>{c.victim_vpa}</td>
                      <td>{fmtINR(c.disputed_amount_inr)}</td>
                      <td>{c.hop_count}</td>
                      <td>{c.timestamp}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--accent-cyan)" }}>
                  <td colSpan={2} style={{ paddingTop: 6 }}><b>Total (disputed only)</b></td>
                  <td style={{ paddingTop: 6 }}><b>{fmtINR(disputedTotal)}</b></td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
            <p style={{ fontSize: 12, color: bnssStrict ? "var(--ok)" : "var(--warn)", marginTop: 10 }}>
              BNSS strict mode: {bnssStrict ? "ON — cap enforced at disputed value." : "OFF — enable in SYSTEM before issuing lien."}
            </p>
            <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 6 }}>
              Generated by NIRAKSHAN console · provenance: {rows[0]?.source || "LIVE"}.
            </p>
          </div>
        </div>
      </div>
    </Pane>
  );
}

/* ---- F9 SYSTEM ------------------------------------------------------------ */

function SystemView() {
  const { theme, setTheme, cycleTheme } = useTheme();
  const { hawkes, setHawkes, bnssStrict, setBnssStrict, selectedNode } = useConsole();
  const { complaints } = useLiveFeed();
  const ranked = useMemo(() => rankTerminals(complaints, hawkes, 0).slice(0, 5), [complaints, hawkes]);

  return (
    <Pane
      title="SYSTEM"
      subtitle="Themes · Hawkes tunables · BNSS strict · SSO"
      right={<button type="button" className="hud-btn" onClick={cycleTheme}>CYCLE THEME</button>}
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Tactical palettes (live)">
          <div className="flex flex-wrap gap-2">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className="hud-btn"
                onClick={() => setTheme(t.id)}
                style={theme === t.id ? { borderColor: "var(--accent-cyan)", boxShadow: "0 0 16px var(--glow)" } : undefined}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Card>

        <Card title="Hawkes tunables (live re-scoring)" right={<span className="hud-chip">node {selectedNode}</span>}>
          {[
            { k: "beta", label: "β (decay)", min: 0.1, max: 4, step: 0.01 },
            { k: "sigma", label: "σ (scale s)", min: 50, max: 1200, step: 10 },
            { k: "alpha", label: "α (excitation)", min: 0.05, max: 0.95, step: 0.01 },
          ].map((f) => (
            <div key={f.k} className="mb-2">
              <div className="flex justify-between" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                <span>{f.label}</span><span>{hawkes[f.k]}</span>
              </div>
              <input
                type="range"
                min={f.min}
                max={f.max}
                step={f.step}
                value={hawkes[f.k]}
                onChange={(e) => setHawkes({ [f.k]: Number(e.target.value) })}
                style={{ width: "100%" }}
                aria-label={f.label}
              />
            </div>
          ))}
          <div className="mt-2">
            <div className="hud-label mb-1">Re-scored λ (top 5)</div>
            {ranked.map((r) => (
              <div key={r.terminal} className="flex justify-between" style={{ fontSize: 12 }}>
                <span>{r.terminal}</span><span style={{ color: "var(--warn)" }}>{r.lambda.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="BNSS strict mode">
          <button
            type="button"
            className="hud-btn"
            onClick={() => setBnssStrict(!bnssStrict)}
            style={bnssStrict ? { borderColor: "var(--ok)", color: "var(--ok)" } : { borderColor: "var(--danger)", color: "var(--danger)" }}
          >
            {bnssStrict ? "STRICT: ON" : "STRICT: OFF"}
          </button>
          {!bnssStrict && (
            <div className="mt-2 rounded-md p-2" style={{ border: "1px solid var(--danger)", background: "color-mix(in srgb, var(--danger) 18%, var(--bg-card))", fontSize: 12, color: "var(--text-main)" }}>
              ⚠ ILLEGAL: lien beyond the disputed value violates Section 102 BNSS. Enable strict mode to cap automatically.
            </div>
          )}
        </Card>

        <Card title="SSO">
          <div className="flex items-center justify-between">
            <div style={{ fontSize: 13 }}>
              Officer: <b>inspector.rao</b>
              <div style={{ fontSize: 12, color: "var(--text-dim)" }}>MHA SSO · role: analyst</div>
            </div>
            <button type="button" className="hud-btn" disabled>SSO ACTIVE</button>
          </div>
        </Card>
      </div>
    </Pane>
  );
}

/* ---- F10 ENGINE ROOM (T4 placeholder) ------------------------------------ */

function EngineRoomView() {
  return (
    <Pane title="ENGINE ROOM" subtitle="Live prediction machinery · same Hawkes math as the map">
      <Coming feature="F10" eta="T4" note="Complaint intake bars per terminal, λ/P ranking, chain-anatomy 0.42^n chips, spike-watch BURST pills, self-narrating decision log." />
    </Pane>
  );
}

/* ---- F3 QR (T4 placeholder) ---------------------------------------------- */

function QrView() {
  return (
    <Pane title="QR FORENSICS" subtitle="BarcodeDetector + ZXing fallback · paste-URI analysis · payee block">
      <Coming feature="F3" eta="T4" note="Camera scan (torch/zoom), FRAUD/LEGIT demo QR generators, FORENSIC BREAKDOWN table, scan history with RE-RUN, BLOCK PAYEE." />
    </Pane>
  );
}

const COMPONENTS = {
  map: MapView,
  alerts: AlertsView,
  qr: QrView,
  entities: EntitiesView,
  transactions: TransactionsView,
  dashboard: DashboardView,
  reports: ReportsView,
  engine: EngineRoomView,
  system: SystemView,
};

export function ViewPane({ id }) {
  const Cmp = COMPONENTS[id] || MapView;
  return <Cmp />;
}

export default COMPONENTS;
