import { useLiveFeed } from "../live/useLiveFeed";
import { useTheme } from "../context/ThemeContext";
import { THEMES } from "../lib/theme";
import { VIEWS } from "../nav";

/* ---- shared bits ---------------------------------------------------------- */

function Pane({ title, subtitle, children, right }) {
  return (
    <section className="fade-in flex flex-col gap-3 h-full">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg md:text-xl font-semibold glow-text" style={{ color: "var(--accent-cyan)" }}>
            {title}
          </h2>
          {subtitle && (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{subtitle}</p>
          )}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Coming({ feature, eta, note }) {
  return (
    <div
      className="hud-panel p-4 flex flex-col gap-2"
      style={{ borderStyle: "dashed" }}
    >
      <div className="hud-chip" style={{ alignSelf: "flex-start" }}>
        {feature}
      </div>
      <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
        {note}{" "}
        <b style={{ color: "var(--accent-cyan)" }}>{eta}</b>.
      </p>
    </div>
  );
}

function fmtINR(n) {
  const v = Number(n);
  return isFinite(v) ? "₹" + v.toLocaleString("en-IN") : "—";
}

/* ---- panes ---------------------------------------------------------------- */

function MapView() {
  const { complaints, anomalies, connected } = useLiveFeed();
  const last = complaints[0];
  return (
    <Pane
      title="RISK MAP · LIVE CHASE"
      subtitle="Hawkes-scored terminals · time-horizon slider · animated theft trace"
      right={<span className="hud-chip">{connected ? "SSE LIVE" : "SSE LINK…"}</span>}
    >
      <div
        className="hud-panel relative flex-1 flex items-center justify-center overflow-hidden"
        style={{ minHeight: 240 }}
      >
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
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            F1 map + F2 animated chase mount here (Leaflet in a ref).
          </p>
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
      <Coming
        feature="F1 + F2"
        eta="T3"
        note="11 Indian terminals, basemap/label/terrain toggles, ATM layer, money arcs with 0.42^n hop-decay labels, INTERCEPT toasts, chase log."
      />
    </Pane>
  );
}

function AlertsView() {
  const { smsAlerts, counters, connected } = useLiveFeed();
  return (
    <Pane
      title="ALERTS · SMS THREAT SENSOR"
      subtitle="Paste an SMS → POST /sms-plain → verdict + matched rules"
      right={<span className="hud-chip">{counters.sms} alerts</span>}
    >
      <Coming
        feature="F4"
        eta="T2"
        note="Paste box + FRAUD/LOTTERY/BENIGN samples, live feed table, red banner + WebAudio siren + vibration armed by ENABLE ALERTS (30s cooldown)."
      />
      <div className="hud-panel p-3 flex-1 overflow-y-auto">
        <div className="hud-label mb-2">Live SMS Alert Frames ({connected ? "streaming" : "offline"})</div>
        {smsAlerts.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--text-dim)" }}>No sms_alert frames received yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {smsAlerts.slice(0, 10).map((s, i) => (
              <li key={i} style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {s.sender || "?"} · {s.verdict || "—"} · risk {s.risk_score ?? "—"}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Pane>
  );
}

function QrView() {
  return (
    <Pane title="QR FORENSICS" subtitle="BarcodeDetector + ZXing fallback · paste-URI analysis · payee block">
      <Coming
        feature="F3"
        eta="T4"
        note="Camera scan (torch/zoom), FRAUD/LEGIT demo QR generators, FORENSIC BREAKDOWN table (PSP/bank/handle/note/txn-ref/params), scan history with RE-RUN, BLOCK PAYEE."
      />
    </Pane>
  );
}

function EntitiesView() {
  return (
    <Pane title="ENTITIES" subtitle="Suspect cluster graph · watchlist · search">
      <Coming feature="F5" eta="T2" note="SVG cluster, clickable peripherals, watchlist toggle, search filter." />
    </Pane>
  );
}

function TransactionsView() {
  return (
    <Pane title="TRANSACTIONS" subtitle="Active case trace + money-trail DAG">
      <Coming
        feature="F6"
        eta="T2"
        note="Live-matching case trace, 0.42^n hop labels, node detail panel with Section-102 lien text."
      />
    </Pane>
  );
}

function DashboardView() {
  const { counters, complaints } = useLiveFeed();
  const kpis = [
    { label: "Complaints", value: counters.complaints, tone: "var(--accent-cyan)" },
    { label: "Anomalies", value: counters.anomalies, tone: "var(--danger)" },
    { label: "SMS alerts", value: counters.sms, tone: "var(--warn)" },
    { label: "Disputed (last 20)", value: fmtINR(complaints.slice(0, 20).reduce((a, c) => a + (Number(c.disputed_amount_inr) || 0), 0)), tone: "var(--ok)" },
  ];
  return (
    <Pane title="DASHBOARD" subtitle="Command overview · live KPIs · regional risk">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="hud-panel p-3">
            <div className="hud-label">{k.label}</div>
            <div className="text-xl md:text-2xl font-semibold" style={{ color: k.tone }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>
      <Coming feature="F7" eta="T2" note="Full live stream table + regional risk bars land here." />
    </Pane>
  );
}

function ReportsView() {
  return (
    <Pane title="REPORTS" subtitle="Dossier archive · preview · EXPORT PDF">
      <Coming
        feature="F8"
        eta="T2"
        note="Section 102 BNSS dossier, disputed-value-only lien, html2pdf export."
      />
    </Pane>
  );
}

function EngineRoomView() {
  return (
    <Pane title="ENGINE ROOM" subtitle="Live prediction machinery · same Hawkes math as the map">
      <Coming
        feature="F10"
        eta="T4"
        note="Complaint intake bars per terminal, λ/P ranking, chain-anatomy 0.42^n chips, spike-watch BURST pills, self-narrating decision log."
      />
    </Pane>
  );
}

function SystemView() {
  const { theme, setTheme, cycleTheme } = useTheme();
  return (
    <Pane
      title="SYSTEM"
      subtitle="Themes · Hawkes tunables · BNSS strict toggle · SSO"
      right={
        <button type="button" className="hud-btn" onClick={cycleTheme}>
          CYCLE THEME
        </button>
      }
    >
      <div className="hud-panel p-3">
        <div className="hud-label mb-2">Tactical palettes (live)</div>
        <div className="flex flex-wrap gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              className="hud-btn"
              style={
                theme === t.id
                  ? { borderColor: "var(--accent-cyan)", boxShadow: "0 0 16px var(--glow)" }
                  : undefined
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <Coming
        feature="F9"
        eta="T2"
        note="Hawkes tunables (β=1.38 σ=350 α=0.42) with live re-scoring, BNSS strict toggle with ILLEGAL warning, SSO card."
      />
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

export function ViewList() {
  return VIEWS.map((v) => ({ ...v }));
}

export default COMPONENTS;
